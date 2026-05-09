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
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','landlord','tenant')),
      phone         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS properties (
      id          SERIAL PRIMARY KEY,
      landlord_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      address     TEXT NOT NULL,
      city        TEXT NOT NULL DEFAULT 'Muscat',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS units (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      unit_number TEXT NOT NULL,
      floor       INTEGER,
      size_sqm    NUMERIC,
      bedrooms    INTEGER,
      bathrooms   INTEGER,
      unit_type   TEXT,
      rent        NUMERIC,
      status      TEXT DEFAULT 'vacant',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tradesmen (
      id          SERIAL PRIMARY KEY,
      landlord_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      trade       TEXT NOT NULL,
      phone       TEXT,
      email       TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id            SERIAL PRIMARY KEY,
      unit_id       INTEGER REFERENCES units(id),
      property_id   INTEGER REFERENCES properties(id),
      landlord_id   INTEGER REFERENCES users(id),
      tenant_name   TEXT NOT NULL,
      tenant_email  TEXT NOT NULL,
      tenant_phone  TEXT,
      track_token   TEXT UNIQUE NOT NULL,
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      photo_path    TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      priority      TEXT NOT NULL DEFAULT 'normal',
      notes         TEXT DEFAULT '',
      assigned_to   INTEGER REFERENCES tradesmen(id),
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      accepted_at   TIMESTAMPTZ,
      assigned_at   TIMESTAMPTZ,
      scheduled_at  TIMESTAMPTZ,
      completed_at  TIMESTAMPTZ,
      closed_at     TIMESTAMPTZ,
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id             SERIAL PRIMARY KEY,
      work_order_id  INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      scheduled_date DATE NOT NULL,
      scheduled_time TEXT NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS completions (
      id             SERIAL PRIMARY KEY,
      work_order_id  INTEGER REFERENCES work_orders(id) ON DELETE CASCADE,
      rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
      feedback       TEXT,
      signed_off_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message    TEXT NOT NULL,
      link       TEXT,
      read       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default admin if none exists
  const bcrypt = require('bcryptjs');
  const { rows } = await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if (!rows.length) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'admin')",
      ['Admin', 'admin@tenantreport.com', hash]
    );
    console.log('Default admin created: admin@tenantreport.com / admin123');
  }
}

module.exports = { pool, init };
