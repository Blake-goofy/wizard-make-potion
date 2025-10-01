-- Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  total_quantity INTEGER NOT NULL,
  used INTEGER DEFAULT 0, -- SQLite uses 0/1 for boolean
  used_at TEXT,
  qr_code_data_url TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_day TEXT NOT NULL,
  event_time TEXT NOT NULL,
  event_address TEXT NOT NULL,
  event_description TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email);

-- Create index on payment_intent_id
CREATE INDEX IF NOT EXISTS idx_tickets_payment_intent ON tickets(payment_intent_id);

-- Create index on used status for validation queries
CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
