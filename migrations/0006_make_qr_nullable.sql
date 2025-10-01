-- Migration to make qr_code_data_url nullable
-- SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table

-- Create new table with nullable qr_code_data_url
CREATE TABLE IF NOT EXISTS tickets_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  ticket_number INTEGER NOT NULL,
  total_quantity INTEGER NOT NULL,
  used INTEGER DEFAULT 0,
  used_at TEXT,
  qr_code_data_url TEXT, -- Made nullable
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_day TEXT NOT NULL,
  event_time TEXT NOT NULL,
  event_address TEXT NOT NULL,
  event_description TEXT,
  event_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table
INSERT INTO tickets_new 
SELECT id, email, purchase_date, payment_intent_id, ticket_number, total_quantity, 
       used, used_at, qr_code_data_url, event_name, event_date, event_day, 
       event_time, event_address, event_description, event_id, created_at
FROM tickets;

-- Drop old table
DROP TABLE tickets;

-- Rename new table
ALTER TABLE tickets_new RENAME TO tickets;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(email);
CREATE INDEX IF NOT EXISTS idx_tickets_payment_intent ON tickets(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_used ON tickets(used);
