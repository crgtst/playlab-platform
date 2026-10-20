-- Codes that may be advertised in the "Current offers" strip.
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS public BOOLEAN NOT NULL DEFAULT FALSE;
