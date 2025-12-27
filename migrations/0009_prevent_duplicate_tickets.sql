-- Add unique constraint to prevent duplicate tickets
-- This ensures that no two tickets can have the same payment_intent_id + ticket_number combination
-- This migration should only be run AFTER cleaning up existing duplicates

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_payment_intent_ticket_number 
ON tickets(payment_intent_id, ticket_number);
