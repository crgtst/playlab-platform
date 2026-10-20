CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  email           CITEXT NOT NULL UNIQUE,
  name            VARCHAR(500) NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'support')),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins   INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('confirm', 'reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mailbox (
  id          SERIAL PRIMARY KEY,
  to_email    CITEXT NOT NULL,
  type        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mailbox_to_email_idx ON mailbox (to_email);

CREATE TABLE IF NOT EXISTS categories (
  id    SERIAL PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id           SERIAL PRIMARY KEY,
  sku          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url    TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discount_codes (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  description      TEXT NOT NULL DEFAULT '',
  type             TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value            INTEGER NOT NULL CHECK (value > 0),
  min_spend_cents  INTEGER NOT NULL DEFAULT 0,
  starts_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  single_use       BOOLEAN NOT NULL DEFAULT FALSE,
  used_count       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS carts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  discount_code_id  INTEGER REFERENCES discount_codes(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id                  UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id               INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity                 INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents_at_add  INTEGER NOT NULL,
  added_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, product_id)
);

CREATE SEQUENCE IF NOT EXISTS order_number_seq;

CREATE TABLE IF NOT EXISTS orders (
  id                SERIAL PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'paid'
                    CHECK (status IN ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal_cents    INTEGER NOT NULL,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  vat_cents         INTEGER NOT NULL,
  delivery_cents    INTEGER NOT NULL,
  total_cents       INTEGER NOT NULL,
  discount_code     TEXT,
  shipping          JSONB NOT NULL,
  delivery_date     DATE,
  instructions      TEXT NOT NULL DEFAULT '',
  card_last4        TEXT NOT NULL,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id          INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  name              TEXT NOT NULL,
  unit_price_cents  INTEGER NOT NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, product_id)
);
