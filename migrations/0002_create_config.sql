-- Migration: Create config table for persistent storage
-- This table stores event configuration as JSON
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only allow one row
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL, -- YYYY-MM-DD format
  event_time TEXT NOT NULL,
  event_address TEXT NOT NULL,
  event_description TEXT,
  ticket_price REAL NOT NULL,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER NOT NULL DEFAULT 10,
  currency TEXT NOT NULL DEFAULT 'usd',
  email_from_address TEXT NOT NULL,
  email_from_name TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default values from config.json
INSERT INTO config (
  id,
  event_name,
  event_date,
  event_time,
  event_address,
  event_description,
  ticket_price,
  min_quantity,
  max_quantity,
  currency,
  email_from_address,
  email_from_name,
  updated_at
) VALUES (
  1,
  'Wizard Make Potion',
  '2025-10-20',
  '7:00 PM',
  '123 Magic Street, Wizard City, WC 12345',
  'Join us for an enchanting evening of potion making!',
  10.00,
  1,
  10,
  'usd',
  'info@wizardmakepotion.com',
  'Wizard Make Potion',
  CURRENT_TIMESTAMP
);
