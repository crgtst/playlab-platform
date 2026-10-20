CREATE TABLE IF NOT EXISTS payment_intents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
  status              TEXT NOT NULL DEFAULT 'requires_payment'
                      CHECK (status IN ('requires_payment', 'processing', 'succeeded', 'declined', 'timed_out')),
  client_secret_hash  TEXT NOT NULL,
  card_last4          TEXT,
  used_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_intent_id UUID UNIQUE REFERENCES payment_intents(id);

CREATE TABLE IF NOT EXISTS avatars (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg')),
  data          BYTEA NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
