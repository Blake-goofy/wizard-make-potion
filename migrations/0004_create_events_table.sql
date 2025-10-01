-- Migration: Create events table for multi-event support
-- This replaces the single config event with a proper events table

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  time TEXT NOT NULL,
  address TEXT NOT NULL,
  description TEXT,
  ticket_price REAL NOT NULL,
  min_quantity INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER NOT NULL DEFAULT 10,
  currency TEXT NOT NULL DEFAULT 'usd',
  tbd_mode INTEGER NOT NULL DEFAULT 0, -- 0 = normal, 1 = TBD mode
  is_active INTEGER NOT NULL DEFAULT 1, -- 0 = hidden/deleted, 1 = active
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on date for sorting
CREATE INDEX idx_events_date ON events(date);

-- Migrate existing config event to events table
INSERT INTO events (
  name, date, time, address, description,
  ticket_price, min_quantity, max_quantity, currency, tbd_mode
)
SELECT 
  event_name, event_date, event_time, event_address, event_description,
  ticket_price, min_quantity, max_quantity, currency, tbd_mode
FROM config
WHERE id = 1;

-- Create settings table for global settings (email, etc)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email_from_address TEXT NOT NULL,
  email_from_name TEXT NOT NULL,
  admin_password_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migrate email settings from config
INSERT INTO settings (id, email_from_address, email_from_name)
SELECT 1, email_from_address, email_from_name
FROM config
WHERE id = 1;

-- Add event_id column to tickets table
ALTER TABLE tickets ADD COLUMN event_id INTEGER REFERENCES events(id);

-- Note: config table is kept for backward compatibility but will not be used
