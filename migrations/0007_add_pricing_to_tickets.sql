-- Add pricing fields to tickets table
ALTER TABLE tickets ADD COLUMN ticket_price REAL;
ALTER TABLE tickets ADD COLUMN subtotal REAL;
ALTER TABLE tickets ADD COLUMN sales_tax REAL;
ALTER TABLE tickets ADD COLUMN total_paid REAL;
