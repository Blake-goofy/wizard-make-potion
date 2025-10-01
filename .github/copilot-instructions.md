# Wizard Make Potion - AI Coding Agent Instructions

## Architecture Overview

This is a **Node.js/Express ticketing system** with Stripe payment processing, QR code generation, and SendGrid email delivery. The app has two main flows:

1. **Payment Flow**: `public/index.html` → `/purchase` → Stripe Elements → `/create-payment-intent` → Stripe webhook → ticket generation + email
2. **Confirmation Flow**: After purchase, user is redirected to `/confirmation?email=...` showing all their tickets with QR codes

### Key Components
- **`server.js`**: Express server with all backend logic (666 lines)
  - Stripe payment intent creation and webhook handling
  - In-memory ticket storage using `Map()` (production would use a database)
  - PDF generation with QR codes using `pdfkit`
  - SendGrid email delivery with ticket PDFs attached
- **`public/script.js`**: Frontend Stripe Elements integration, quantity selector, payment form
- **`public/purchase.html`**: Purchase page with embedded Stripe card element
- **`public/index.html`**: Landing page with event details

## Critical Environment Variables

Required in `.env` file:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SENDGRID_API_KEY=SG....
ADMIN_PASSWORD=your_secure_password_here
PORT=3000
```

**Stripe Keys**: Replace in TWO places:
1. `.env` - `STRIPE_SECRET_KEY` (server-side)
2. `public/script.js` line 1 - `Stripe('pk_test_...')` (client-side publishable key)

**Admin Password**: Used for `/admin` page authentication (HTTP Basic Auth)

**Email**: App uses SendGrid with custom domain configured in `config.json`. No fallback if `SENDGRID_API_KEY` is missing.

## Development Workflows

### Start Server
```powershell
npm start           # Production mode
npm run dev         # Development with nodemon
```

### Test Email Without Payment
```powershell
# Use development endpoint to bypass Stripe webhooks
curl -X POST http://localhost:3000/generate-tickets -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"quantity\":2}"
```

### Test Email Functionality
```powershell
curl -X POST http://localhost:3000/test-email -H "Content-Type: application/json" -d "{\"email\":\"your@email.com\"}"
```

### Kill Node Processes (if port 3000 is busy)
```powershell
taskkill /IM node.exe /F
```

## Project-Specific Conventions

### Configuration System
All event details, pricing, and email settings are stored in `config.json`:
```json
{
  "event": {
    "name": "Event Name",
    "date": "2025-10-20",  // YYYY-MM-DD format
    "time": "7:00 PM",
    "address": "Full address",
    "description": "Event description"
  },
  "ticketing": {
    "price": 10.00,
    "minQuantity": 1,
    "maxQuantity": 10,
    "currency": "usd"
  },
  "email": {
    "fromAddress": "info@domain.com",
    "fromName": "Event Name"
  }
}
```

- **Dynamic Loading**: Frontend fetches config from `/api/config` endpoint
- **Day of Week**: Automatically calculated from `event.date` using `getEventInfo()` function
- **Admin Management**: Admins can update all settings via `/admin` page (password-protected)

### Ticket Pricing
- **Dynamic pricing** from `config.json` - no hardcoded values
- Amount sent to Stripe in **cents** (`price * 100`)
- Quantity limits configurable via admin page

### Ticket Data Structure
Each ticket stored in `tickets` Map with:
```javascript
{
  id: uuidv4(),                    // Unique ticket ID (also QR code data)
  email: string,
  purchaseDate: ISO string,
  paymentIntentId: string,         // Stripe payment ID
  ticketNumber: 1,                 // Ticket number (e.g., "1 of 3")
  totalQuantity: 3,
  used: false,                     // For check-in system
  usedAt: null,
  qrCodeDataUrl: 'data:image/png;base64,...',
  event: getEventInfo()            // Snapshot of event details at purchase time
}
```

### Payment Flow Details
1. Frontend calls `/create-payment-intent` with `{ amount, email, quantity }`
2. Stripe creates PaymentIntent with email/quantity in `metadata`
3. User completes payment on frontend using Stripe Elements
4. Stripe sends webhook to `/api/stripe/webhook` on success
5. Webhook triggers `generateAndSendTickets()` which creates tickets and sends email
6. Frontend redirects to `/confirmation?email=...` after successful payment

### QR Codes
- Generated using `qrcode` library with ticket UUID as data
- Stored as base64 data URLs in ticket object
- Embedded in both HTML confirmation page and PDF attachment

## Integration Points

### Stripe Webhooks
- Endpoint: `POST /api/stripe/webhook`
- Must use `express.raw()` middleware (not `express.json()`) to verify signature
- Validates webhook signature with `STRIPE_WEBHOOK_SECRET`
- Only processes `payment_intent.succeeded` events

### SendGrid Email
- Requires verified domain (`wizardmakepotion.com`)
- Sends from `info@wizardmakepotion.com`
- Attaches PDF with all purchased tickets
- Silently fails if `SENDGRID_API_KEY` not configured (logs error, doesn't throw)

### PDF Generation
- Uses `pdfkit` to create A4 tickets with QR codes
- Each ticket gets its own page in PDF
- QR code base64 data converted to Buffer for embedding

## Testing & Debugging

### Local Development
Server runs on `localhost:3000`. No database required (uses in-memory Map).

### Testing Without Stripe
Use `/generate-tickets` endpoint to bypass payment flow entirely - generates tickets and sends email immediately.

### Common Issues
- **Port 3000 busy**: Use `taskkill /IM node.exe /F`
- **Email not sending**: Check if `SENDGRID_API_KEY` is set (app continues silently if missing)
- **Webhook not firing**: Ensure webhook endpoint is publicly accessible and secret matches `.env`
- **QR code not showing in PDF**: Check base64 data format (must be `data:image/png;base64,...`)
