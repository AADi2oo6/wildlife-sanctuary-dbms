/**
 * applyExtensions.js
 *
 * Applies backend/database/core_extension.sql to the connected PostgreSQL
 * database. All objects in that file use CREATE OR REPLACE / CREATE VIEW,
 * so this script is safe to run multiple times (idempotent).
 *
 * Usage (run AFTER prisma migrate deploy):
 *   node scripts/applyExtensions.js
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });
dotenv.config();

const sqlPath = join(__dirname, '../database/core_extension.sql');
const sql     = readFileSync(sqlPath, 'utf8');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('✅ core_extension.sql applied successfully.');
} catch (err) {
  console.error('❌ Failed to apply core_extension.sql:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
