import { afterAll } from 'vitest';
import { pool } from '../../src/db/pool';

afterAll(() => pool.end());
