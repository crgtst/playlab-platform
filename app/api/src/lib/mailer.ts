import { PoolClient } from 'pg';
import { pool } from '../db/pool';
import { clock } from './clock';

export interface OutgoingEmail {
  to: string;
  type: 'confirm-email' | 'password-reset';
  subject: string;
  body: string;
  link?: string;
}

/** The app never sends real email: messages land in the mailbox table, readable via GET /test/mailbox/:email. */
export async function sendEmail(email: OutgoingEmail, client?: PoolClient): Promise<void> {
  const db = client ?? pool;
  await db.query(`INSERT INTO mailbox (to_email, type, subject, body, link, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [
    email.to,
    email.type,
    email.subject,
    email.body,
    email.link ?? null,
    clock.now(),
  ]);
}
