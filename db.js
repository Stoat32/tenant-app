const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS work_orders (
      id          SERIAL PRIMARY KEY,
      tenant_name TEXT NOT NULL,
      unit_number TEXT NOT NULL,
      email       TEXT NOT NULL,
      phone       TEXT,
      category    TEXT NOT NULL,
      description TEXT NOT NULL,
      photo_path  TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      priority    TEXT NOT NULL DEFAULT 'normal',
      notes       TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = { pool, init };
