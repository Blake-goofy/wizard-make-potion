# Wizard Make Potion - Ticket Purchase Page

A web application for purchasing event tickets using Stripe payment processing with QR code generation, email delivery, and admin configuration.

## Features

- 💳 Secure Stripe payment processing
- 🎫 Unique QR code generation for each ticket
- 📧 Email confirmations with PDF tickets attached
- 🔧 **Admin configuration page** for managing event details
- 📊 Dynamic pricing and quantity limits
- 🎨 Mobile-responsive dark theme design
- ✅ Ticket validation system for event entry

## Quick Start

1. **Install dependencies:**
   ```powershell
   npm install
   ```

2. **Copy example files:**
   ```powershell
   copy .env.example .env
   copy config.json.example config.json
   ```

3. **Configure environment variables** in `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   SENDGRID_API_KEY=SG.your_api_key_here
   ADMIN_PASSWORD=your_secure_password
   PORT=3000
   ```

4. **Update Stripe publishable key** in `public/script.js` (line 1):
   ```javascript
   const stripe = Stripe('pk_test_your_publishable_key_here');
   ```

5. **Run the server:**
   ```powershell
   npm start              # Production mode
   npm run dev            # Development with auto-restart
   ```

6. **Access the site:**
   - Event page: http://localhost:3000
   - Purchase page: http://localhost:3000/purchase
   - **Admin page**: http://localhost:3000/admin
   - Ticket validation: http://localhost:3000/validate

## Admin Configuration

### Accessing the Admin Page

1. Navigate to http://localhost:3000/admin
2. Enter the password from `ADMIN_PASSWORD` in your `.env` file
3. Update event details, pricing, and email settings
4. Changes take effect immediately - no server restart needed!

### What You Can Configure

**Event Information:**
- Event name
- Event date (day of week calculated automatically)
- Event time
- Event address
- Event description

**Ticketing Settings:**
- Ticket price
- Minimum quantity per purchase
- Maximum quantity per purchase

**Email Settings:**
- From email address
- From name (sender name in emails)

All settings are stored in `config.json` and loaded dynamically by the frontend.

## Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your test keys from the Stripe Dashboard
3. Add secret key to `.env` file
4. Add publishable key to `public/script.js`
5. Create a webhook endpoint pointing to `https://yourdomain.com/api/stripe/webhook`
6. Add the webhook secret to `.env`

## Email Configuration

### SendGrid Setup (Recommended for Custom Domain)

1. Sign up at https://sendgrid.com
2. Verify your domain in SendGrid dashboard
3. Create an API key in SendGrid → Settings → API Keys
4. Add to `.env`: `SENDGRID_API_KEY=SG.your_api_key_here`
5. Update email settings in admin page or `config.json`

### Testing Email

```powershell
# Test email delivery without making a purchase
curl -X POST http://localhost:3000/test-email -H "Content-Type: application/json" -d "{\"email\":\"your@email.com\"}"
```

## Development Tools

### Generate Test Tickets

Bypass Stripe payment flow for testing:

```powershell
curl -X POST http://localhost:3000/generate-tickets -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"quantity\":2}"
```

### Kill Stuck Node Processes

If port 3000 is busy:

```powershell
taskkill /IM node.exe /F
```

## Ticket Validation System

For event staff to validate tickets at the door:

1. Visit `/validate` page on a mobile device or tablet
2. Scan QR codes using device camera (if supported)
3. Or manually enter ticket IDs
4. System prevents duplicate entries automatically

**Features:**
- ✅ One-time use validation
- 📱 Mobile-friendly interface
- 🔍 Manual entry fallback
- 📊 Usage tracking with timestamps

## Project Structure

```
wizard-make-potion/
├── public/
│   ├── index.html          # Landing page (loads event details dynamically)
│   ├── purchase.html       # Ticket purchase form
│   ├── admin.html          # Admin configuration page
│   ├── script.js           # Stripe Elements & payment handling
│   └── styles.css          # Dark theme styling
├── server.js               # Express server with all backend logic
├── config.json             # Event configuration (editable via admin page)
├── .env                    # Environment variables (not tracked in git)
├── package.json            # Dependencies
└── .gitignore              # Excludes config.json, .env, node_modules
```

## Security Notes

- `config.json` is **not tracked in git** - each environment has its own config
- Admin page uses HTTP Basic Auth with password from `.env`
- For production, use HTTPS and a strong `ADMIN_PASSWORD`
- Stripe webhooks verify signatures to prevent tampering
- Ticket data stored in-memory (consider adding a database for production)

## Common Issues

| Problem | Solution |
|---------|----------|
| Port 3000 already in use | Run `taskkill /IM node.exe /F` |
| Email not sending | Check `SENDGRID_API_KEY` in `.env` |
| Webhook not firing | Ensure endpoint is publicly accessible and secret matches |
| QR code not in PDF | Verify base64 format is `data:image/png;base64,...` |
| Admin page won't load | Check `ADMIN_PASSWORD` is set in `.env` |

## Contributing

This is a simple event ticketing system designed for small events. Feel free to extend it with:

- Database integration (MongoDB, PostgreSQL, etc.)
- Multiple event support
- Advanced reporting/analytics
- Refund handling
- Multi-user admin system

## License

MIT
