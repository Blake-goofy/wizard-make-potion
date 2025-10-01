-- Migration: Add TBD mode toggle
-- Allows admins to disable ticket sales when event date is not confirmed
ALTER TABLE config ADD COLUMN tbd_mode INTEGER NOT NULL DEFAULT 0; -- 0 = normal, 1 = TBD mode
