-- Migration: Remove TBD mode column from events table
-- Date: 2025
-- Description: TBD mode is no longer needed with multi-event support. 
--              Instead of TBD mode, we simply don't create future events until dates are confirmed.

-- Drop the tbd_mode column from events table
ALTER TABLE events DROP COLUMN tbd_mode;
