require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const qrcode = require('qrcode');
const sgMail = require('@sendgrid/mail');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Load configuration
const CONFIG_FILE = path.join(__dirname, 'config.json');
let config = loadConfig();

function loadConfig() {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading config.json:', error.message);
    // Return default config if file doesn't exist
    return {
      event: {
        name: 'Wizard Make Potion',
        date: '2025-10-20',
        time: '7:00 PM',
        address: '123 Magic Street, Wizard City, WC 12345',
        description: 'Join us for an enchanting evening!'
      },
      ticketing: {
        price: 10.00,
        minQuantity: 1,
        maxQuantity: 10,
        currency: 'usd'
      },
      email: {
        fromAddress: 'info@wizardmakepotion.com',
        fromName: 'Wizard Make Potion'
      }
    };
  }
}

function saveConfig(newConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
  config = newConfig;
}

function getEventInfo() {
  const eventDate = new Date(config.event.date);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  return {
    name: config.event.name,
    date: `${months[eventDate.getMonth()]} ${eventDate.getDate()}, ${eventDate.getFullYear()}`,
    day: days[eventDate.getDay()],
    time: config.event.time,
    address: config.event.address,
    description: config.event.description
  };
}

// Admin authentication middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const password = credentials.split(':')[1]; // Format is "username:password", we only care about password
  
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  next();
}

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API: Get event configuration (public endpoint)
app.get('/api/config', (req, res) => {
  const eventInfo = getEventInfo();
  res.json({
    event: eventInfo,
    ticketing: config.ticketing
  });
});

// API: Update event configuration (admin only)
app.post('/api/config', requireAuth, (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate required fields
    if (!newConfig.event || !newConfig.event.name || !newConfig.event.date) {
      return res.status(400).json({ error: 'Missing required event fields' });
    }
    
    saveConfig(newConfig);
    res.json({ success: true, config: newConfig });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Admin page route - protected with authentication
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/public/admin.html');
});

// Purchase page route
app.get('/purchase', (req, res) => {
  res.sendFile(__dirname + '/public/purchase.html');
});

// Store tickets in memory (in production, use a database)
const tickets = new Map();

app.post('/create-payment-intent', async (req, res) => {
  const { amount, email, quantity = 1 } = req.body; // amount in cents

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: {
        email: email,
        quantity: quantity.toString()
      }
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Webhook to handle successful payments
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const email = paymentIntent.metadata.email;
    const quantity = parseInt(paymentIntent.metadata.quantity) || 1;
    
    if (email) {
      await generateAndSendTickets(email, paymentIntent.id, quantity);
    }
  }

  res.json({ received: true });
});

app.get('/confirmation', async (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).send('Email is required');
  }

  // Find all tickets for this email (in production, query database)
  const userTickets = Array.from(tickets.values()).filter(t => t.email === email);
  
  if (!userTickets.length) {
    return res.send(`
      <html>
        <head>
          <title>Tickets Not Found - Wizard Make Potion</title>
          <link rel="stylesheet" href="/styles.css">
        </head>
        <body>
          <div style="text-align: center; padding: 50px;">
            <h1>Tickets Not Found</h1>
            <p>Your tickets are being processed. Please check your email for confirmation.</p>
            <a href="/" class="buy-tickets-btn" style="display: inline-block; margin-top: 20px;">Return to Event</a>
          </div>
        </body>
      </html>
    `);
  }

  // Generate HTML for all tickets
  const ticketsHtml = userTickets.map(ticket => `
    <div class="ticket ${ticket.used ? 'used' : ''}">
      <h3>Ticket ${ticket.ticketNumber} of ${ticket.totalQuantity}</h3>
      <p><strong>Ticket ID:</strong> ${ticket.id}</p>
      <p><strong>Purchase Date:</strong> ${new Date(ticket.purchaseDate).toLocaleString()}</p>
      ${ticket.used ? `<p class="used-notice">⚠️ USED: ${new Date(ticket.usedAt).toLocaleString()}</p>` : ''}
      <div class="qr-code">
        <img src="${ticket.qrCodeDataUrl}" alt="QR Code for Ticket ${ticket.ticketNumber}" />
      </div>
      <p>Show this QR code at the event entrance.</p>
    </div>
  `).join('<div style="height: 30px;"></div>');

  res.send(`
    <html>
      <head>
        <title>Your Tickets - Wizard Make Potion</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .confirmation-container {
            max-width: 600px;
            margin: 50px auto;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }
          
          .confirmation-header {
            text-align: center;
            margin-bottom: 30px;
          }
          
          .confirmation-header h1 {
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 10px;
          }
          
          .event-details-box {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 15px;
            padding: 20px;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .event-details-box h3 {
            color: #4ecdc4;
            margin-bottom: 15px;
            text-align: center;
          }
          
          .ticket {
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(255, 255, 255, 0.2);
            padding: 25px;
            border-radius: 15px;
            margin: 20px 0;
            text-align: center;
            position: relative;
          }
          
          .ticket.used {
            border-color: #ff6b6b;
            background: rgba(255, 107, 107, 0.1);
          }
          
          .used-notice {
            color: #ff6b6b;
            font-weight: bold;
            margin: 10px 0;
          }
          
          .qr-code {
            background: white;
            padding: 15px;
            border-radius: 10px;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }
          
          .qr-code img {
            display: block;
            max-width: 150px;
            height: auto;
          }
          
          .screenshot-notice {
            background: linear-gradient(45deg, rgba(78, 205, 196, 0.1), rgba(255, 107, 107, 0.1));
            border: 1px solid rgba(78, 205, 196, 0.3);
            border-radius: 10px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
          }
          
          .screenshot-notice strong {
            color: #4ecdc4;
          }
          
          .purchase-more-top {
            position: absolute;
            top: 20px;
            left: 20px;
          }
          
          .email-info {
            color: #e0e0e0;
            margin-bottom: 20px;
          }
          
          .email-sent-notice {
            background: rgba(78, 205, 196, 0.1);
            border: 1px solid rgba(78, 205, 196, 0.3);
            border-radius: 10px;
            padding: 15px;
            margin-top: 30px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="confirmation-container">
          <a href="/" class="back-link">← Purchase More Tickets</a>
          
          <div class="confirmation-header">
            <h1>${userTickets[0].event.name}</h1>
            <h2 style="color: #ffffff; margin-top: 10px;">Your Ticket Confirmation</h2>
          </div>
          
          <div class="event-details-box">
            <h3>Event Details</h3>
            <p><strong>When:</strong> ${userTickets[0].event.day}, ${userTickets[0].event.date} at ${userTickets[0].event.time}</p>
            <p><strong>Where:</strong> ${userTickets[0].event.address}</p>
          </div>
          
          <div class="email-info">
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Total Tickets:</strong> ${userTickets.length}</p>
          </div>
          
          <div class="screenshot-notice">
            <strong>💡 Pro Tip:</strong> Take a screenshot of this page for easy access to your tickets!
          </div>
          
          <div class="tickets-container">
            ${ticketsHtml}
          </div>
          
          <div class="email-sent-notice">
            A confirmation email has been sent to ${email} with all your tickets as a PDF attachment.
          </div>
        </div>
      </body>
    </html>
  `);
});

// Development endpoint to generate tickets (bypasses webhooks)
app.post('/generate-tickets', async (req, res) => {
  const { email, quantity = 1 } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const generatedTickets = [];
    
    for (let i = 0; i < quantity; i++) {
      const ticketId = uuidv4();
    const ticketData = {
      id: ticketId,
      email: email,
      purchaseDate: new Date().toISOString(),
      paymentIntentId: 'dev-' + ticketId,
      ticketNumber: i + 1,
      totalQuantity: quantity,
      used: false, // Track if ticket has been scanned/used
      usedAt: null, // Timestamp when ticket was used
      event: getEventInfo() // Include event details
    };    // Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(ticketId);      ticketData.qrCodeDataUrl = qrCodeDataUrl;
      tickets.set(ticketId, ticketData);
      generatedTickets.push(ticketData);
    }

    // Send email with all tickets
    try {
      console.log(`About to send email for ${generatedTickets.length} tickets to ${email}`);
      await sendTicketsEmail(generatedTickets);
      console.log('Email sending completed');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    res.json({ success: true, ticketCount: quantity });
  } catch (error) {
    console.error('Ticket generation error:', error);
    res.status(500).json({ error: 'Failed to generate tickets' });
  }
});

async function generateAndSendTickets(email, paymentIntentId, quantity = 1) {
  const generatedTickets = [];
  
  for (let i = 0; i < quantity; i++) {
    const ticketId = uuidv4();
    const ticketData = {
      id: ticketId,
      email: email,
      purchaseDate: new Date().toISOString(),
      paymentIntentId: paymentIntentId,
      ticketNumber: i + 1,
      totalQuantity: quantity,
      used: false, // Track if ticket has been scanned/used
      usedAt: null, // Timestamp when ticket was used
      event: getEventInfo() // Include event details
    };

    // Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(ticketId);

    ticketData.qrCodeDataUrl = qrCodeDataUrl;
    tickets.set(ticketId, ticketData);
    generatedTickets.push(ticketData);
  }

  // Send email with all tickets
  await sendTicketsEmail(generatedTickets);
}

async function generateTicketsPDF(tickets) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });
    
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer);
    });
    
    const eventInfo = getEventInfo();
    
    // Header
    doc.fontSize(24).text(eventInfo.name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text('Event Tickets', { align: 'center' });
    doc.moveDown();
    
    // Event details
    doc.fontSize(12).text(`${eventInfo.day}, ${eventInfo.date} at ${eventInfo.time}`, { align: 'center' });
    doc.text(eventInfo.address, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Purchased: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);
    
    // Generate each ticket
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      
      // Ticket border
      doc.rect(50, doc.y, 500, 250).stroke();
      doc.moveDown(0.5);
      
      // Ticket header
      doc.fontSize(16).text(`Ticket ${ticket.ticketNumber} of ${ticket.totalQuantity}`, { align: 'center' });
      doc.moveDown();
      
      // Ticket details
      doc.fontSize(10);
      doc.text(`Ticket ID: ${ticket.id}`);
      doc.text(`Email: ${ticket.email}`);
      doc.text(`Purchase Date: ${new Date(ticket.purchaseDate).toLocaleString()}`);
      doc.moveDown();
      
      // QR Code
      if (ticket.qrCodeDataUrl) {
        // Convert base64 to buffer for PDF embedding
        const qrBuffer = Buffer.from(ticket.qrCodeDataUrl.split(',')[1], 'base64');
        
        // Position QR code in center
        const qrX = 225; // Center horizontally
        const qrY = doc.y;
        const qrSize = 150;
        
        try {
          doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
        } catch (error) {
          console.error('Error embedding QR code in PDF:', error);
          doc.text('(QR Code generation failed)', qrX, qrY + qrSize/2, { width: qrSize, align: 'center' });
        }
        
        doc.moveDown(qrSize / 10 + 1); // Move past the QR code
      }
      
      // Instructions
      doc.fontSize(10).text('Show this QR code at the event entrance for admission.', { align: 'center' });
      doc.moveDown();
      
      // Add page break for next ticket (except for last one)
      if (i < tickets.length - 1) {
        doc.addPage();
      }
    }
    
    doc.end();
  });
}

async function sendTicketsEmail(tickets) {
  if (!tickets.length) return;
  
  const email = tickets[0].email;
  const quantity = tickets.length;

  console.log(`Attempting to send email to ${email} for ${quantity} tickets via SendGrid`);

  if (!process.env.SENDGRID_API_KEY) {
    console.error('SendGrid API key not configured - no emails will be sent');
    return;
  }

  // Generate PDF with all tickets
  const pdfBuffer = await generateTicketsPDF(tickets);
  
  const eventInfo = getEventInfo();

  const msg = {
    to: email,
    from: config.email.fromAddress,
    subject: `Your ${quantity} ${eventInfo.name} Ticket${quantity > 1 ? 's' : ''}`,
    html: `
      <h1>Your Tickets for ${eventInfo.name}</h1>
      <p><strong>Event Details:</strong><br>
      ${eventInfo.day}, ${eventInfo.date} at ${eventInfo.time}<br>
      ${eventInfo.address}</p>
      <p>Thank you for your purchase! Your ${quantity} ticket${quantity > 1 ? 's are' : ' is'} attached as a PDF.</p>
      <p><strong>Important:</strong> Please save this PDF and bring it with you to the event. Show the QR code${quantity > 1 ? 's' : ''} at the entrance for admission.</p>
      <p>We look forward to seeing you at the event!</p>
      <p>If you have any questions, please contact us at ${config.email.fromAddress}.</p>
    `,
    attachments: [{
      filename: `wizard-make-potion-tickets-${quantity}.pdf`,
      content: pdfBuffer.toString('base64'),
      type: 'application/pdf',
      disposition: 'attachment'
    }]
  };

  try {
    const result = await sgMail.send(msg);
    console.log('SendGrid email sent successfully:', result[0]?.statusCode);
  } catch (error) {
    console.error('Error sending tickets email via SendGrid:', error);
    console.error('Error details:', error.message);
  }
}const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Test email endpoint
app.post('/test-email', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Create a simple test ticket
    const testTicket = {
      id: 'test-123',
      email: email,
      purchaseDate: new Date().toISOString(),
      ticketNumber: 1,
      totalQuantity: 1,
      qrCodeDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      event: getEventInfo()
    };

    await sendTicketsEmail([testTicket]);
    res.json({ success: true, message: 'Test email sent' });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ticket validation endpoint for door staff
app.post('/validate-ticket', (req, res) => {
  const { ticketId } = req.body;
  
  if (!ticketId) {
    return res.status(400).json({ 
      valid: false, 
      message: 'Ticket ID is required' 
    });
  }

  const ticket = tickets.get(ticketId);
  
  if (!ticket) {
    return res.status(404).json({ 
      valid: false, 
      message: 'Ticket not found' 
    });
  }

  // Check if ticket is for the correct event
  const eventInfo = getEventInfo();
  if (!ticket.event || ticket.event.name !== eventInfo.name) {
    return res.status(400).json({ 
      valid: false, 
      message: 'Ticket is not for this event' 
    });
  }

  if (ticket.used) {
    return res.status(400).json({ 
      valid: false, 
      message: 'Ticket has already been used',
      usedAt: ticket.usedAt,
      email: ticket.email
    });
  }

  // Mark ticket as used
  ticket.used = true;
  ticket.usedAt = new Date().toISOString();
  
  res.json({ 
    valid: true, 
    message: 'Ticket is valid - entry granted',
    ticket: {
      id: ticket.id,
      email: ticket.email,
      ticketNumber: ticket.ticketNumber,
      totalQuantity: ticket.totalQuantity,
      purchaseDate: ticket.purchaseDate
    }
  });
});

// Ticket validation page for staff
app.get('/validate', (req, res) => {
  const eventInfo = getEventInfo();
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ticket Validation - ${eventInfo.name}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
        .scanner { text-align: center; margin: 20px 0; }
        .result { margin: 20px 0; padding: 15px; border-radius: 5px; }
        .valid { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .invalid { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        input { width: 100%; padding: 10px; font-size: 16px; margin: 10px 0; }
        button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background-color: #0056b3; }
        .manual-entry { margin-top: 20px; }
      </style>
    </head>
    <body>
      <h1>🎫 Ticket Validation</h1>
      <div style="background-color: #f0f0f0; padding: 15px; margin: 20px 0; border-radius: 5px; text-align: center;">
        <h2>${eventInfo.name}</h2>
        <p><strong>Event:</strong> ${eventInfo.day}, ${eventInfo.date} at ${eventInfo.time}</p>
        <p><strong>Location:</strong> ${eventInfo.address}</p>
      </div>
      <p>Scan QR codes or manually enter ticket IDs to validate entry.</p>
      
      <div class="scanner">
        <button onclick="startScanner()">📱 Start Camera Scanner</button>
        <p id="scanner-status">Camera scanner not available on this device</p>
      </div>

      <div class="manual-entry">
        <h3>Manual Entry</h3>
        <input type="text" id="ticketId" placeholder="Enter Ticket ID" />
        <br>
        <button onclick="validateTicket()">Validate Ticket</button>
      </div>

      <div id="result"></div>

      <script>
        let scannerActive = false;

        function showResult(message, isValid) {
          const result = document.getElementById('result');
          result.className = 'result ' + (isValid ? 'valid' : 'invalid');
          result.textContent = message;
        }

        async function validateTicket(ticketId = null) {
          if (!ticketId) {
            ticketId = document.getElementById('ticketId').value.trim();
          }
          
          if (!ticketId) {
            showResult('Please enter a ticket ID', false);
            return;
          }

          try {
            const response = await fetch('/validate-ticket', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ ticketId })
            });

            const data = await response.json();
            
            if (data.valid) {
              showResult(\`✅ VALID: \${data.message}\`, true);
            } else {
              showResult(\`❌ INVALID: \${data.message}\`, false);
            }
          } catch (error) {
            showResult('Error validating ticket: ' + error.message, false);
          }
        }

        function startScanner() {
          // For now, just show that scanner would start
          // In production, integrate with a QR code scanning library
          document.getElementById('scanner-status').textContent = 
            'Scanner would start here. For now, use manual entry.';
        }

        // Allow scanning by pasting ticket ID
        document.addEventListener('paste', (event) => {
          const pastedText = event.clipboardData.getData('text');
          if (pastedText && pastedText.length > 10) { // Likely a ticket ID
            document.getElementById('ticketId').value = pastedText;
            validateTicket(pastedText);
          }
        });
      </script>
    </body>
    </html>
  `);
});