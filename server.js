const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');

// File upload config
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(Object.assign(new Error('Only image files are allowed'), { status: 400 }));
    }
    cb(null, true);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Submit a new work order
app.post('/api/work-orders', upload.single('photo'), async (req, res) => {
  const { tenant_name, unit_number, email, phone, category, description } = req.body;
  if (!tenant_name || !unit_number || !email || !category || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const photo_path = req.file ? req.file.filename : null;

  const { rows } = await pool.query(
    `INSERT INTO work_orders (tenant_name, unit_number, email, phone, category, description, photo_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenant_name, unit_number, email, phone || null, category, description, photo_path]
  );

  res.status(201).json({ success: true, id: rows[0].id });
});

// Get all work orders
app.get('/api/work-orders', async (req, res) => {
  const { status, category, sort } = req.query;
  const conditions = [];
  const params = [];

  if (status && status !== 'all') { params.push(status); conditions.push(`status = $${params.length}`); }
  if (category && category !== 'all') { params.push(category); conditions.push(`category = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const order = sort === 'oldest' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT * FROM work_orders ${where} ORDER BY created_at ${order}`,
    params
  );
  res.json(rows);
});

// Get a single work order
app.get('/api/work-orders/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM work_orders WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// Update work order
app.patch('/api/work-orders/:id', async (req, res) => {
  const { status, priority, notes } = req.body;
  await pool.query(
    `UPDATE work_orders
     SET status   = COALESCE($1, status),
         priority = COALESCE($2, priority),
         notes    = COALESCE($3, notes),
         updated_at = NOW()
     WHERE id = $4`,
    [status || null, priority || null, notes !== undefined ? notes : null, req.params.id]
  );
  res.json({ success: true });
});

// Stats
app.get('/api/stats', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE status = 'pending')       AS pending,
      COUNT(*) FILTER (WHERE status = 'in_progress')   AS "inProgress",
      COUNT(*) FILTER (WHERE status = 'resolved')      AS resolved
    FROM work_orders
  `);
  const r = rows[0];
  res.json({
    total: Number(r.total),
    pending: Number(r.pending),
    inProgress: Number(r.inProgress),
    resolved: Number(r.resolved)
  });
});

// Boot: init DB then listen
init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Tenant Work Order app running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
