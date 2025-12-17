-- Fix existing ticket pricing data
-- Problem: subtotal, sales_tax, and total_paid contain the full order amount on every ticket
-- Solution: Divide by total_quantity to get per-ticket amounts

UPDATE tickets
SET 
  subtotal = ROUND(subtotal / total_quantity, 2),
  sales_tax = ROUND(sales_tax / total_quantity, 2),
  total_paid = ROUND(total_paid / total_quantity, 2)
WHERE 
  total_quantity > 0 
  AND subtotal IS NOT NULL 
  AND sales_tax IS NOT NULL 
  AND total_paid IS NOT NULL;
