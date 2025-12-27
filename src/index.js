import { Hono } from 'hono';

const app = new Hono();

// Helper function to get Stripe key based on test mode
function getStripeKey(c, keyType = 'secret') {
  const isTestMode = c.req.header('X-Test-Mode') === 'true';
  
  if (keyType === 'secret') {
    return isTestMode ? c.env.STRIPE_SECRET_KEY_DEV : c.env.STRIPE_SECRET_KEY;
  } else if (keyType === 'webhook') {
    return isTestMode ? c.env.STRIPE_WEBHOOK_SECRET_DEV : c.env.STRIPE_WEBHOOK_SECRET;
  }
  
  return c.env.STRIPE_SECRET_KEY; // Default to production
}

// Helper function to get event info from config
function getEventInfo(config) {
  const eventDate = new Date(config.event.date);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return {
    name: config.event.name,
    date: `${months[eventDate.getMonth()]} ${eventDate.getDate()}, ${eventDate.getFullYear()}`,
    day: days[eventDate.getDay()],
    time: config.event.time,
    address: config.event.address,
    description: config.event.description,
    tbdMode: config.event.tbdMode || false
  };
}

// Load configuration from D1 database
async function loadConfig(env) {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM config WHERE id = 1'
    ).first();
    
    if (result) {
      console.log('Loaded config from D1, tbd_mode:', result.tbd_mode);
      const config = {
        event: {
          name: result.event_name,
          date: result.event_date,
          time: result.event_time,
          address: result.event_address,
          description: result.event_description,
          tbdMode: result.tbd_mode === 1
        },
        ticketing: {
          price: result.ticket_price,
          minQuantity: result.min_quantity,
          maxQuantity: result.max_quantity,
          currency: result.currency
        },
        email: {
          fromAddress: result.email_from_address,
          fromName: result.email_from_name
        }
      };
      console.log('Config tbdMode:', config.event.tbdMode);
      return config;
    }
  } catch (error) {
    console.error('Error loading config from D1:', error);
  }
  
  // Fallback to default config if D1 fails
  console.log('Using fallback config');
  return {
    event: {
      name: 'Wizard Make Potion',
      date: '2025-10-20',
      time: '7:00 PM',
      address: '123 Magic Street, Wizard City, WC 12345',
      description: 'Join us for an enchanting evening of magical elixirs, mystical performances, and wizardry wonders. Experience the art of potion-making like never before!',
      tbdMode: false
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

// Basic auth middleware
async function requireAuth(c, next) {
  const authHeader = c.req.header('authorization');
  const adminPassword = c.env.ADMIN_PASSWORD;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    c.header('WWW-Authenticate', 'Basic realm="Admin Area"');
    return c.text('Authentication required', 401);
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = atob(base64Credentials);
  const password = credentials.split(':')[1];
  
  if (password !== adminPassword) {
    c.header('WWW-Authenticate', 'Basic realm="Admin Area"');
    return c.text('Invalid credentials', 401);
  }
  
  await next();
}

// Helper to format event from DB row
function formatEvent(row) {
  // Parse date components
  const [year, month, day] = row.date.split('-').map(Number);
  const eventDate = new Date(year, month - 1, day);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Parse event time and add 6-hour buffer before marking as past
  const timeMatch = row.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
  let eventDateTime;
  
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const meridiem = timeMatch[3].toUpperCase();
    
    // Convert to 24-hour format
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    
    eventDateTime = new Date(year, month - 1, day, hours, minutes);
  } else {
    // Default to end of day if parsing fails
    eventDateTime = new Date(year, month - 1, day, 23, 59);
  }
  
  // Add 6-hour buffer after event time (6 hours in milliseconds)
  const eventEndWithBuffer = new Date(eventDateTime.getTime() + (6 * 60 * 60 * 1000));
  const now = new Date();
  const isPast = now > eventEndWithBuffer;
  
  return {
    id: row.id,
    name: row.name,
    date: `${months[eventDate.getMonth()]} ${eventDate.getDate()}, ${eventDate.getFullYear()}`,
    rawDate: row.date,
    day: days[eventDate.getDay()],
    time: row.time,
    address: row.address,
    description: row.description,
    ticketPrice: row.ticket_price,
    minQuantity: row.min_quantity,
    maxQuantity: row.max_quantity,
    currency: row.currency,
    tbdMode: row.tbd_mode === 1,
    isPast: isPast,
    isActive: row.is_active === 1
  };
}

// API: Get all events (separated into upcoming and past)
app.get('/api/events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM events WHERE is_active = 1 ORDER BY date ASC'
    ).all();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const formattedEvents = results.map(formatEvent);
    const upcomingEvents = formattedEvents.filter(e => !e.isPast);
    const pastEvents = formattedEvents.filter(e => e.isPast);
    
    return c.json({
      upcoming: upcomingEvents,
      past: pastEvents
    });
  } catch (error) {
    console.error('Error loading events:', error);
    return c.json({ error: 'Failed to load events' }, 500);
  }
});

// API: Get single event by ID
app.get('/api/events/:id', async (c) => {
  try {
    const eventId = c.req.param('id');
    const result = await c.env.DB.prepare(
      'SELECT * FROM events WHERE id = ? AND is_active = 1'
    ).bind(eventId).first();
    
    if (!result) {
      return c.json({ error: 'Event not found' }, 404);
    }
    
    return c.json(formatEvent(result));
  } catch (error) {
    console.error('Error loading event:', error);
    return c.json({ error: 'Failed to load event' }, 500);
  }
});

// API: Get event configuration (public endpoint) - DEPRECATED, kept for backward compatibility
app.get('/api/config', async (c) => {
  const config = await loadConfig(c.env);
  const eventInfo = getEventInfo(config);
  
  return c.json({
    event: eventInfo,
    ticketing: config.ticketing
  });
});

// API: Get Stripe publishable key based on test mode
app.get('/api/stripe-key', async (c) => {
  const isTestMode = c.req.header('X-Test-Mode') === 'true';
  const publishableKey = isTestMode 
    ? c.env.STRIPE_PUBLISHABLE_KEY_DEV 
    : c.env.STRIPE_PUBLISHABLE_KEY;
  
  return c.json({ publishableKey });
});

// Create payment intent
app.post('/create-payment-intent', async (c) => {
  const { amount, email, quantity = 1, eventId } = await c.req.json();
  
  if (!eventId) {
    return c.json({ error: 'Event ID is required' }, 400);
  }
  
  // Get event to retrieve ticket price
  const event = await c.env.DB.prepare(
    'SELECT ticket_price FROM events WHERE id = ?'
  ).bind(eventId).first();
  
  if (!event) {
    return c.json({ error: 'Event not found' }, 404);
  }
  
  const ticketPrice = event.ticket_price;
  const subtotal = ticketPrice * quantity;
  
  // Sales tax rate
  const SALES_TAX_RATE = 0.09;
  const salesTax = Math.round(subtotal * SALES_TAX_RATE * 100) / 100;
  const totalAmount = subtotal + salesTax;
  
  // Convert to cents for Stripe
  const amountInCents = Math.round(totalAmount * 100);
  
  // Initialize Stripe with appropriate key based on test mode
  const stripeKey = getStripeKey(c, 'secret');
  const stripe = (await import('stripe')).default(stripeKey);
  
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'usd',
      metadata: {
        email: email,
        quantity: quantity.toString(),
        eventId: eventId.toString(),
        ticketPrice: ticketPrice.toString(),
        subtotal: subtotal.toFixed(2),
        salesTax: salesTax.toFixed(2),
        totalAmount: totalAmount.toFixed(2)
      }
    });

    return c.json({
      clientSecret: paymentIntent.client_secret,
      pricing: {
        ticketPrice: ticketPrice,
        quantity: quantity,
        subtotal: subtotal,
        salesTax: salesTax,
        total: totalAmount
      }
    });
  } catch (error) {
    return c.json({ error: error.message }, 500);
  }
});

// Check payment status and generate tickets (for dev when webhooks don't work)
app.post('/api/check-payment', async (c) => {
  const { paymentIntentId } = await c.req.json();
  
  if (!paymentIntentId) {
    return c.json({ error: 'Payment Intent ID is required' }, 400);
  }
  
  const stripeKey = getStripeKey(c, 'secret');
  const stripe = (await import('stripe')).default(stripeKey);
  
  try {
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return c.json({ 
        status: paymentIntent.status,
        ready: false 
      });
    }
    
    // Check if tickets already exist
    const { results } = await c.env.DB.prepare(
      'SELECT id FROM tickets WHERE payment_intent_id = ? LIMIT 1'
    ).bind(paymentIntentId).all();
    
    if (results.length > 0) {
      return c.json({ 
        status: 'succeeded',
        ready: true,
        ticketsExist: true
      });
    }
    
    // Payment succeeded but tickets don't exist - generate them
    const email = paymentIntent.metadata.email;
    const quantity = parseInt(paymentIntent.metadata.quantity) || 1;
    const eventId = parseInt(paymentIntent.metadata.eventId);
    
    // Extract pricing from metadata if available
    const pricingInfo = paymentIntent.metadata.ticketPrice ? {
      ticketPrice: parseFloat(paymentIntent.metadata.ticketPrice),
      subtotal: parseFloat(paymentIntent.metadata.subtotal),
      salesTax: parseFloat(paymentIntent.metadata.salesTax),
      total: parseFloat(paymentIntent.metadata.totalAmount)
    } : null;
    
    if (email && eventId) {
      await generateAndSendTickets(c.env, email, paymentIntentId, quantity, eventId, pricingInfo);
      return c.json({ 
        status: 'succeeded',
        ready: true,
        ticketsGenerated: true
      });
    }
    
    return c.json({ error: 'Missing metadata' }, 400);
  } catch (error) {
    console.error('Check payment error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Stripe webhook handler
app.post('/api/stripe/webhook', async (c) => {
  const sig = c.req.header('stripe-signature');
  const body = await c.req.text();
  
  // Detect test mode from the webhook event itself
  // Stripe test events have specific ID patterns
  let isTestMode = false;
  try {
    const eventData = JSON.parse(body);
    // Test events have IDs starting with "evt_00000000000000" or "evt_3" for test mode
    // Test payment intents start with "pi_" but livemode property is the most reliable
    isTestMode = eventData.livemode === false;
  } catch (e) {
    console.log('Could not parse event body for test mode detection:', e.message);
  }
  
  const stripeKey = isTestMode ? c.env.STRIPE_SECRET_KEY_DEV : c.env.STRIPE_SECRET_KEY;
  const webhookSecret = isTestMode ? c.env.STRIPE_WEBHOOK_SECRET_DEV : c.env.STRIPE_WEBHOOK_SECRET;
  const stripe = (await import('stripe')).default(stripeKey);
  
  let event;
  try {
    // Use constructEventAsync for Cloudflare Workers (Web Crypto API is async)
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    console.log('Detected test mode:', isTestMode);
    console.log('Using webhook secret:', webhookSecret ? '(configured)' : '(NOT SET)');
    return c.text(`Webhook Error: ${err.message}`, 400);
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const email = paymentIntent.metadata.email;
    const quantity = parseInt(paymentIntent.metadata.quantity) || 1;
    const eventId = parseInt(paymentIntent.metadata.eventId);
    
    // Check if tickets already exist for this payment intent (idempotency)
    // This prevents duplicate tickets when Stripe retries webhooks
    const { results } = await c.env.DB.prepare(
      'SELECT id FROM tickets WHERE payment_intent_id = ? LIMIT 1'
    ).bind(paymentIntent.id).all();
    
    if (results.length > 0) {
      console.log(`Tickets already exist for payment intent ${paymentIntent.id}, skipping generation (webhook retry detected)`);
      return c.json({ received: true, skipped: 'tickets_exist' });
    }
    
    // Extract pricing from metadata if available
    const pricingInfo = paymentIntent.metadata.ticketPrice ? {
      ticketPrice: parseFloat(paymentIntent.metadata.ticketPrice),
      subtotal: parseFloat(paymentIntent.metadata.subtotal),
      salesTax: parseFloat(paymentIntent.metadata.salesTax),
      total: parseFloat(paymentIntent.metadata.totalAmount)
    } : null;
    
    if (email && eventId) {
      await generateAndSendTickets(c.env, email, paymentIntent.id, quantity, eventId, pricingInfo);
    }
  }

  return c.json({ received: true });
});

// Generate UUID (Workers-compatible)
function generateUUID() {
  return crypto.randomUUID();
}

// Generate QR code as SVG string (works in Cloudflare Workers)
async function generateQRCode(data) {
  try {
    const QRCode = (await import('qrcode')).default;
    // Generate QR code as SVG string (doesn't require canvas)
    const svgString = await QRCode.toString(data, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 1
    });
    
    // Convert SVG to data URL
    const qrDataUrl = 'data:image/svg+xml;base64,' + btoa(svgString);
    console.log(`QR code generated for: ${data}, length: ${qrDataUrl.length}`);
    return qrDataUrl;
  } catch (error) {
    console.error('QR code generation failed:', error);
    return null;
  }
}

// Send email via SendGrid
async function sendTicketEmail(env, email, tickets, eventInfo, paymentIntentId, pricing) {
  try {
    // Build ticket list for email (simplified - no QR in email)
    const ticketsHtml = tickets.map(ticket => `
      <div style="border: 2px solid #4ecdc4; border-radius: 15px; padding: 20px; margin: 20px 0; background: #f9f9f9;">
        <h3 style="color: #333; margin-top: 0;">Ticket ${ticket.ticketNumber} of ${ticket.totalQuantity}</h3>
        <p style="color: #666;"><strong>Ticket ID:</strong> ${ticket.id}</p>
      </div>
    `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4ecdc4; margin-bottom: 10px;">Your Tickets Are Ready!</h1>
            <p style="color: #666; font-size: 18px;">${eventInfo.name}</p>
          </div>
          
          <div style="background: #e8f8f5; border: 2px solid #4ecdc4; border-radius: 10px; padding: 25px; margin: 30px 0; text-align: center;">
            <h2 style="color: #4ecdc4; margin-top: 0;">Payment Successful!</h2>
            <p style="color: #333; font-size: 16px; margin: 15px 0;">
              <strong>You purchased ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} for ${eventInfo.name}</strong>
            </p>
            <p style="color: #666; margin: 10px 0;">
              <strong>When:</strong> ${eventInfo.day}, ${eventInfo.date} at ${eventInfo.time}
            </p>
            <p style="color: #666; margin: 10px 0;">
              <strong>Where:</strong> ${eventInfo.address}
            </p>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #4ecdc4;">
              <h3 style="color: #333; margin-top: 0;">Payment Summary</h3>
              <p style="color: #666; margin: 5px 0;">
                Ticket Price: $${pricing.ticketPrice.toFixed(2)} × ${tickets.length} = $${pricing.subtotal.toFixed(2)}
              </p>
              <p style="color: #666; margin: 5px 0;">
                Estimated Sales Tax: $${pricing.salesTax.toFixed(2)}
              </p>
              <p style="color: #333; margin: 15px 0; font-size: 18px;">
                <strong>Total Paid: $${pricing.total.toFixed(2)}</strong>
              </p>
            </div>
          </div>
          
          <div style="background: #e8f8f5; border: 2px solid #4ecdc4; border-radius: 10px; padding: 25px; margin: 30px 0; text-align: center;">
            <h3 style="color: #4ecdc4; margin-top: 0;">View Your Tickets</h3>
            <p style="color: #333; margin: 15px 0;">
              Click the button below to view your tickets with QR codes:
            </p>
            <div style="margin: 20px 0;">
              <a href="https://wizardmakepotion.com/confirmation?payment_intent=${paymentIntentId}" 
                 style="display: inline-block; padding: 15px 40px; background: #4ecdc4; color: #000; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">
                View My Tickets →
              </a>
            </div>
            <p style="color: #999; font-size: 12px; margin: 10px 0;">
              Or copy this link: https://wizardmakepotion.com/confirmation?payment_intent=${paymentIntentId}
            </p>
            <p style="color: #666; font-size: 14px; margin: 10px 0;">
              Bookmark this link to access your tickets anytime
            </p>
          </div>
          
          <div style="background: #f9f9f9; border-radius: 10px; padding: 20px; margin: 20px 0;">
            <p style="color: #666; margin: 5px 0; font-size: 14px;">
              <strong>Your Ticket IDs:</strong>
            </p>
            ${ticketsHtml}
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            See you at the event! 🎉
          </p>
        </body>
      </html>
    `;

    // Send via SendGrid API (using fetch, not the SDK)
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: email }],
          subject: `Your Tickets for ${eventInfo.name}`
        }],
        from: {
          email: 'info@wizardmakepotion.com',
          name: eventInfo.name
        },
        content: [{
          type: 'text/html',
          value: emailHtml
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('SendGrid API error:', error);
      throw new Error(`SendGrid failed: ${response.status}`);
    }

    console.log(`Email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

// Generate and send tickets
async function generateAndSendTickets(env, email, paymentIntentId, quantity = 1, eventId, pricingInfo = null) {
  // Load event from database
  const eventResult = await env.DB.prepare(
    'SELECT * FROM events WHERE id = ?'
  ).bind(eventId).first();
  
  if (!eventResult) {
    throw new Error('Event not found');
  }
  
  const eventInfo = formatEvent(eventResult);
  
  // Calculate pricing if not provided
  let pricing = pricingInfo;
  if (!pricing) {
    const ticketPrice = eventResult.ticket_price;
    const subtotal = ticketPrice * quantity;
    const salesTax = Math.round(subtotal * 0.09 * 100) / 100; // Sales tax
    pricing = {
      ticketPrice: ticketPrice,
      subtotal: subtotal,
      salesTax: salesTax,
      total: subtotal + salesTax
    };
  }
  
  const generatedTickets = [];
  let actuallyCreatedCount = 0;  // Track tickets we actually inserted
  
  for (let i = 0; i < quantity; i++) {
    const ticketId = generateUUID();
    
    // Generate QR code with ticket ID
    const qrCodeDataUrl = await generateQRCode(ticketId);
    
    // Insert ticket into D1 with event_id reference and per-ticket pricing info
    // Divide order-level amounts by quantity to get per-ticket amounts
    try {
      await env.DB.prepare(`
        INSERT INTO tickets (
          id, email, purchase_date, payment_intent_id, ticket_number, 
          total_quantity, used, used_at, qr_code_data_url,
          event_name, event_date, event_day, event_time, event_address, event_description,
          event_id, ticket_price, subtotal, sales_tax, total_paid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        ticketId,
        email,
        new Date().toISOString(),
        paymentIntentId,
        i + 1,
        quantity,
        0,
        null,
        qrCodeDataUrl,
        eventInfo.name,
        eventInfo.date,
        eventInfo.day,
        eventInfo.time,
        eventInfo.address,
        eventInfo.description,
        eventId,
        pricing.ticketPrice,
        Math.round(pricing.subtotal / quantity * 100) / 100,  // Per-ticket subtotal
        Math.round(pricing.salesTax / quantity * 100) / 100,  // Per-ticket tax
        Math.round(pricing.total / quantity * 100) / 100      // Per-ticket total
      ).run();
      
      actuallyCreatedCount++;  // Successfully created
      generatedTickets.push({
        id: ticketId,
        email,
        ticketNumber: i + 1,
        totalQuantity: quantity,
        qrCodeDataUrl
      });
    } catch (error) {
      // Handle unique constraint violation (race condition with concurrent webhooks)
      if (error.message && error.message.includes('UNIQUE constraint failed')) {
        console.log(`Ticket ${i + 1} for payment intent ${paymentIntentId} already exists (concurrent webhook detected), skipping`);
        // Don't add to generatedTickets array - we didn't create it
        // This prevents sending duplicate emails
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }
  
  // Send email with tickets and pricing info
  // Only send if we actually created NEW tickets (not all were duplicates from concurrent webhooks)
  if (actuallyCreatedCount > 0) {
    await sendTicketEmail(env, email, generatedTickets, eventInfo, paymentIntentId, pricing);
    console.log(`Generated ${actuallyCreatedCount} tickets for ${email} for event ${eventId}`);
  } else {
    console.log(`All tickets already existed for ${email} (payment intent ${paymentIntentId}), concurrent webhook detected, no email sent`);
  }
}

// Get tickets API endpoint
app.get('/api/tickets', async (c) => {
  const paymentIntentId = c.req.query('payment_intent');
  const email = c.req.query('email');
  
  if (!paymentIntentId && !email) {
    return c.json({ error: 'Payment intent or email is required' }, 400);
  }

  // Fetch tickets from D1 by payment_intent_id or email
  const { results } = paymentIntentId 
    ? await c.env.DB.prepare(
        'SELECT * FROM tickets WHERE payment_intent_id = ? ORDER BY ticket_number ASC'
      ).bind(paymentIntentId).all()
    : await c.env.DB.prepare(
        'SELECT * FROM tickets WHERE email = ? ORDER BY ticket_number ASC'
      ).bind(email).all();
  
  return c.json({ tickets: results || [] });
});

// Get confirmation page - just serve the HTML file
app.get('/confirmation', async (c) => {
  return c.html(await c.env.ASSETS.fetch(new Request('https://example.com/confirmation.html')).then(r => r.text()));
});

// Validate ticket endpoint
app.post('/api/validate-ticket', async (c) => {
  const { ticketId } = await c.req.json();
  
  if (!ticketId) {
    return c.json({ 
      valid: false, 
      message: 'Ticket ID is required' 
    }, 400);
  }

  // Fetch ticket from D1
  const ticket = await c.env.DB.prepare(
    'SELECT * FROM tickets WHERE id = ?'
  ).bind(ticketId).first();
  
  if (!ticket) {
    return c.json({ 
      valid: false, 
      message: 'Ticket not found' 
    }, 404);
  }

  if (ticket.used) {
    return c.json({ 
      valid: false, 
      message: 'Ticket has already been used',
      usedAt: ticket.used_at,
      email: ticket.email
    }, 400);
  }

  // Mark ticket as used
  await c.env.DB.prepare(
    'UPDATE tickets SET used = 1, used_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), ticketId).run();
  
  return c.json({ 
    valid: true, 
    message: 'Ticket is valid - entry granted',
    ticket: {
      id: ticket.id,
      email: ticket.email,
      ticketNumber: ticket.ticket_number,
      totalQuantity: ticket.total_quantity,
      purchaseDate: ticket.purchase_date
    }
  });
});

// Scan ticket endpoint (for door scanning with camera)
app.post('/api/scan-ticket', requireAuth, async (c) => {
  try {
    const { ticketId } = await c.req.json();
    
    if (!ticketId) {
      return c.json({ 
        success: false, 
        message: 'Ticket ID required',
        status: 'error'
      }, 400);
    }

    // Look up ticket in database
    const ticket = await c.env.DB.prepare(
      'SELECT * FROM tickets WHERE id = ?'
    ).bind(ticketId).first();

    if (!ticket) {
      return c.json({ 
        success: false, 
        message: 'Invalid ticket - not found in system',
        status: 'invalid'
      }, 404);
    }

    // Check if already used
    if (ticket.used === 1) {
      return c.json({ 
        success: false, 
        message: `Already scanned at ${new Date(ticket.used_at).toLocaleString()}`,
        status: 'already_used',
        ticket: {
          email: ticket.email,
          ticketNumber: ticket.ticket_number,
          totalQuantity: ticket.total_quantity,
          usedAt: ticket.used_at
        }
      }, 200);
    }

    // Mark ticket as used
    await c.env.DB.prepare(
      'UPDATE tickets SET used = 1, used_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), ticketId).run();

    // Get event details
    const event = await c.env.DB.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).bind(ticket.event_id).first();

    return c.json({ 
      success: true, 
      message: 'Ticket validated - entry granted!',
      status: 'valid',
      ticket: {
        email: ticket.email,
        ticketNumber: ticket.ticket_number,
        totalQuantity: ticket.total_quantity,
        eventName: ticket.event_name,
        eventDate: ticket.event_date,
        scannedAt: new Date().toISOString()
      }
    }, 200);

  } catch (error) {
    console.error('Scan ticket error:', error);
    return c.json({ 
      success: false, 
      message: 'Server error', 
      status: 'error' 
    }, 500);
  }
});

// Development endpoint: Generate test tickets without Stripe
app.post('/api/dev/generate-tickets', async (c) => {
  try {
    const { email, quantity = 1, eventId } = await c.req.json();
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }
    
    if (!eventId) {
      return c.json({ error: 'Event ID is required' }, 400);
    }
    
    const testPaymentIntentId = 'pi_test_' + Date.now();
    await generateAndSendTickets(c.env, email, testPaymentIntentId, quantity, eventId);
    
    return c.json({ 
      success: true, 
      message: `Generated ${quantity} ticket(s) for ${email}`,
      confirmationUrl: `/confirmation?payment_intent=${testPaymentIntentId}`
    });
  } catch (error) {
    console.error('Test ticket generation error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Admin login endpoint
app.post('/api/admin/login', async (c) => {
  try {
    const { password } = await c.req.json();
    
    if (password === c.env.ADMIN_PASSWORD) {
      return c.json({ success: true });
    } else {
      return c.json({ success: false, message: 'Invalid password' }, 401);
    }
  } catch (error) {
    return c.json({ success: false, message: 'Invalid request' }, 400);
  }
});

// Admin API: List tickets with filters
app.get('/api/admin/tickets', async (c) => {
  const password = c.req.header('X-Admin-Password');
  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const eventIdParam = c.req.query('eventId');
    const emailParam = c.req.query('email');

    const params = [];
    let query = `
      SELECT id, email, used, used_at, ticket_number, event_name, purchase_date, event_id, total_paid, payment_intent_id
      FROM tickets
      WHERE 1=1
    `;

    const eventId = eventIdParam ? parseInt(eventIdParam, 10) : null;
    if (Number.isFinite(eventId)) {
      query += ' AND event_id = ?';
      params.push(eventId);
    }

    if (emailParam && emailParam.trim()) {
      query += ' AND email LIKE ?';
      params.push(`%${emailParam.trim()}%`);
    }

    query += ' ORDER BY purchase_date DESC LIMIT 500';

    const statement = params.length
      ? c.env.DB.prepare(query).bind(...params)
      : c.env.DB.prepare(query);

    const { results } = await statement.all();

    const tickets = (results || []).map(row => ({
      id: row.id,
      email: row.email,
      used: row.used === 1,
      usedAt: row.used_at,
      ticketNumber: row.ticket_number,
      eventName: row.event_name || 'Event',
      purchaseDate: row.purchase_date,
      eventId: row.event_id,
      totalPaid: row.total_paid,
      paymentIntentId: row.payment_intent_id
    }));

    return c.json({ tickets });
  } catch (error) {
    console.error('Error loading tickets:', error);
    return c.json({ error: 'Failed to load tickets' }, 500);
  }
});

// Admin API: Get all events (including inactive)
app.get('/api/admin/events', async (c) => {
  const password = c.req.header('X-Admin-Password');
  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM events ORDER BY date DESC'
    ).all();
    
    return c.json(results.map(formatEvent));
  } catch (error) {
    console.error('Error loading admin events:', error);
    return c.json({ error: 'Failed to load events' }, 500);
  }
});

// Admin API: Create new event
app.post('/api/admin/events', async (c) => {
  const password = c.req.header('X-Admin-Password');
  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const event = await c.req.json();
    
    const result = await c.env.DB.prepare(`
      INSERT INTO events (
        name, date, time, address, description,
        ticket_price, min_quantity, max_quantity, currency, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      event.name,
      event.date,
      event.time,
      event.address,
      event.description || '',
      event.ticket_price,
      event.min_quantity,
      event.max_quantity,
      event.currency || 'usd'
    ).run();
    
    return c.json({ success: true, id: result.meta.last_row_id });
  } catch (error) {
    console.error('Error creating event:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Admin API: Update event
app.put('/api/admin/events/:id', async (c) => {
  const password = c.req.header('X-Admin-Password');
  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const eventId = c.req.param('id');
    const event = await c.req.json();
    
    await c.env.DB.prepare(`
      UPDATE events SET
        name = ?,
        date = ?,
        time = ?,
        address = ?,
        description = ?,
        ticket_price = ?,
        min_quantity = ?,
        max_quantity = ?,
        currency = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      event.name,
      event.date,
      event.time,
      event.address,
      event.description || '',
      event.ticket_price,
      event.min_quantity,
      event.max_quantity,
      event.currency || 'usd',
      eventId
    ).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating event:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Admin API: Delete event (soft delete)
app.delete('/api/admin/events/:id', async (c) => {
  const password = c.req.header('X-Admin-Password');
  if (password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const eventId = c.req.param('id');
    
    await c.env.DB.prepare(
      'DELETE FROM events WHERE id = ?'
    ).bind(eventId).run();
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Sales page - serves HTML (auth checked client-side)
app.get('/sales', async (c) => {
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const asset = await c.env.ASSETS.fetch(new URL('/sales.html', url.origin));
      return asset;
    } catch (e) {
      return c.text('Sales page not found', 404);
    }
  }
  return c.text('Sales page not found', 404);
});

// Admin page - serves HTML (auth checked client-side)
app.get('/admin', async (c) => {
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const asset = await c.env.ASSETS.fetch(new URL('/admin.html', url.origin));
      return asset;
    } catch (e) {
      return c.text('Admin page not found', 404);
    }
  }
  return c.text('Admin page not found', 404);
});

// Scan page - serves HTML (auth checked client-side)
app.get('/scan', async (c) => {
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const asset = await c.env.ASSETS.fetch(new URL('/scan.html', url.origin));
      return asset;
    } catch (e) {
      return c.text('Scan page not found', 404);
    }
  }
  return c.text('Scan page not found', 404);
});

// About page
app.get('/about', async (c) => {
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      const asset = await c.env.ASSETS.fetch(new URL('/about.html', url.origin));
      return asset;
    } catch (e) {
      return c.text('About page not found', 404);
    }
  }
  return c.text('About page not found', 404);
});

// API: Update configuration (password required in request)
app.post('/api/config', async (c) => {
  try {
    const body = await c.req.json();
    const password = c.req.header('X-Admin-Password');
    
    // Check password
    if (password !== c.env.ADMIN_PASSWORD) {
      return c.json({ success: false, message: 'Unauthorized' }, 401);
    }
    
    // Save to D1 database
    await c.env.DB.prepare(`
      UPDATE config SET
        event_name = ?,
        event_date = ?,
        event_time = ?,
        event_address = ?,
        event_description = ?,
        ticket_price = ?,
        min_quantity = ?,
        max_quantity = ?,
        currency = ?,
        email_from_address = ?,
        email_from_name = ?,
        tbd_mode = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).bind(
      body.event.name,
      body.event.date,
      body.event.time,
      body.event.address,
      body.event.description || '',
      body.ticketing.price,
      body.ticketing.minQuantity,
      body.ticketing.maxQuantity,
      body.ticketing.currency || 'usd',
      body.email.fromAddress,
      body.email.fromName,
      body.event.tbdMode ? 1 : 0
    ).run();
    
    return c.json({ 
      success: true, 
      message: 'Configuration updated successfully and saved to database!'
    });
  } catch (error) {
    console.error('Error saving config:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Serve static files from ASSETS binding - MUST BE LAST
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    try {
      const url = new URL(c.req.url);
      let assetPath = url.pathname;
      
      // Handle root path
      if (assetPath === '/') {
        assetPath = '/index.html';
      }
      // Handle routes that should serve HTML
      else if (assetPath === '/purchase') {
        assetPath = '/purchase.html';
      }
      else if (assetPath === '/sales') {
        assetPath = '/sales.html';
      }
      
      const asset = await c.env.ASSETS.fetch(new URL(assetPath, url.origin));
      return asset;
    } catch (e) {
      return c.text('Not found', 404);
    }
  }
  
  return c.text('Not found', 404);
});

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
};
