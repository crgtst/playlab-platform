-- Phase 1: optimistic locking. Every status change bumps the version; the order's ETag is built from it.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
