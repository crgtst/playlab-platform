CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       VARCHAR(100) NOT NULL,
  body        VARCHAR(1000) NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
CREATE INDEX IF NOT EXISTS reviews_product_idx ON reviews (product_id, created_at DESC);

-- Only used by the discount-stacking defect in bug mode.
ALTER TABLE carts ADD COLUMN IF NOT EXISTS extra_discount_code_id INTEGER REFERENCES discount_codes(id) ON DELETE SET NULL;

-- Quantities are validated in the API; the quantity-negative defect needs the database to accept 0 and below.
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_quantity_check;
