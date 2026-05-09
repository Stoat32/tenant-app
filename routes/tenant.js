const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  }
});

// Get all properties (for unit selection dropdown)
router.get('/properties', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.address, p.city,
            json_agg(json_build_object('id',u.id,'unit_number',u.unit_number) ORDER BY u.unit_number) AS units
     FROM properties p
     LEFT JOIN units u ON u.property_id=p.id
     GROUP BY p.id ORDER BY p.name`
  );
  res.json(rows);
});

// Submit a work order
router.post('/submit', upload.single('photo'), async (req, res) => {
  const { tenant_name, tenant_email, tenant_phone, property_id, unit_id, category, description } = req.body;
  if (!tenant_name || !tenant_email || !property_id || !unit_id || !category || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Find the landlord for this property
  const { rows: prop } = await pool.query(
    'SELECT landlord_id FROM properties WHERE id=$1', [property_id]
  );
  if (!prop.length) return res.status(404).json({ error: 'Property not found' });

  const track_token = crypto.randomBytes(20).toString('hex');
  const photo_path = req.file ? req.file.filename : null;

  const { rows } = await pool.query(
    `INSERT INTO work_orders
      (unit_id,property_id,landlord_id,tenant_name,tenant_email,tenant_phone,track_token,category,description,photo_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,track_token`,
    [unit_id, property_id, prop[0].landlord_id, tenant_name, tenant_email,
     tenant_phone||null, track_token, category, description, photo_path]
  );

  res.status(201).json({ success: true, id: rows[0].id, track_token: rows[0].track_token });
});

// Track a work order by token
router.get('/track/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT w.*, p.name AS property_name, u.unit_number,
            t.name AS tradesman_name, t.trade AS tradesman_trade, t.phone AS tradesman_phone,
            b.scheduled_date, b.scheduled_time,
            c.rating, c.feedback, c.signed_off_at
     FROM work_orders w
     LEFT JOIN properties p ON p.id=w.property_id
     LEFT JOIN units u ON u.id=w.unit_id
     LEFT JOIN tradesmen t ON t.id=w.assigned_to
     LEFT JOIN bookings b ON b.work_order_id=w.id
     LEFT JOIN completions c ON c.work_order_id=w.id
     WHERE w.track_token=$1`,
    [req.params.token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Work order not found' });
  res.json(rows[0]);
});

// Book a time slot
router.post('/track/:token/book', async (req, res) => {
  const { scheduled_date, scheduled_time } = req.body;
  if (!scheduled_date || !scheduled_time) return res.status(400).json({ error: 'Date and time required' });

  const { rows } = await pool.query('SELECT id,status FROM work_orders WHERE track_token=$1', [req.params.token]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (!['accepted','in_progress','scheduled'].includes(rows[0].status)) {
    return res.status(400).json({ error: 'Work order not ready for booking' });
  }

  await pool.query('DELETE FROM bookings WHERE work_order_id=$1', [rows[0].id]);
  await pool.query(
    'INSERT INTO bookings (work_order_id,scheduled_date,scheduled_time) VALUES ($1,$2,$3)',
    [rows[0].id, scheduled_date, scheduled_time]
  );
  await pool.query(
    "UPDATE work_orders SET status='scheduled', scheduled_at=$1, updated_at=NOW() WHERE id=$2",
    [new Date().toISOString(), rows[0].id]
  );
  res.json({ success: true });
});

// Sign off completion + rate
router.post('/track/:token/complete', async (req, res) => {
  const { rating, feedback } = req.body;
  if (!rating) return res.status(400).json({ error: 'Rating required' });

  const { rows } = await pool.query('SELECT id,status FROM work_orders WHERE track_token=$1', [req.params.token]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  if (rows[0].status !== 'completed') {
    return res.status(400).json({ error: 'Work order is not marked complete yet' });
  }

  await pool.query('DELETE FROM completions WHERE work_order_id=$1', [rows[0].id]);
  await pool.query(
    'INSERT INTO completions (work_order_id,rating,feedback) VALUES ($1,$2,$3)',
    [rows[0].id, rating, feedback||null]
  );
  await pool.query(
    "UPDATE work_orders SET status='closed', closed_at=NOW(), updated_at=NOW() WHERE id=$1",
    [rows[0].id]
  );
  res.json({ success: true });
});

module.exports = router;
