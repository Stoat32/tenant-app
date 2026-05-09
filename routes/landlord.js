const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const auth = requireAuth('landlord');

// ── Properties ──────────────────────────────────────────────
router.get('/properties', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM properties WHERE landlord_id=$1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/properties', auth, async (req, res) => {
  const { name, address, city } = req.body;
  if (!name || !address) return res.status(400).json({ error: 'Missing fields' });
  const { rows } = await pool.query(
    'INSERT INTO properties (landlord_id,name,address,city) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, name, address, city || 'Muscat']
  );
  res.status(201).json(rows[0]);
});

router.delete('/properties/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM properties WHERE id=$1 AND landlord_id=$2', [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ── Units ────────────────────────────────────────────────────
router.get('/properties/:id/units', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.* FROM units u
     JOIN properties p ON p.id=u.property_id
     WHERE u.property_id=$1 AND p.landlord_id=$2
     ORDER BY u.unit_number`,
    [req.params.id, req.user.id]
  );
  res.json(rows);
});

router.post('/properties/:id/units', auth, async (req, res) => {
  const { unit_number, floor, size_sqm, bedrooms, bathrooms, unit_type, rent } = req.body;
  if (!unit_number) return res.status(400).json({ error: 'Unit number required' });
  const { rows } = await pool.query(
    `INSERT INTO units (property_id,unit_number,floor,size_sqm,bedrooms,bathrooms,unit_type,rent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.params.id, unit_number, floor||null, size_sqm||null, bedrooms||null, bathrooms||null, unit_type||null, rent||null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/units/:id', auth, async (req, res) => {
  await pool.query(
    `DELETE FROM units WHERE id=$1 AND property_id IN (SELECT id FROM properties WHERE landlord_id=$2)`,
    [req.params.id, req.user.id]
  );
  res.json({ success: true });
});

// ── Tradesmen ────────────────────────────────────────────────
router.get('/tradesmen', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM tradesmen WHERE landlord_id=$1 ORDER BY name',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/tradesmen', auth, async (req, res) => {
  const { name, trade, phone, email } = req.body;
  if (!name || !trade) return res.status(400).json({ error: 'Name and trade required' });
  const { rows } = await pool.query(
    'INSERT INTO tradesmen (landlord_id,name,trade,phone,email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, name, trade, phone||null, email||null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/tradesmen/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM tradesmen WHERE id=$1 AND landlord_id=$2', [req.params.id, req.user.id]);
  res.json({ success: true });
});

// ── Work Orders ──────────────────────────────────────────────
router.get('/work-orders', auth, async (req, res) => {
  const { status, category, sort } = req.query;
  const conditions = ['w.landlord_id=$1'];
  const params = [req.user.id];

  if (status && status !== 'all') { params.push(status); conditions.push(`w.status=$${params.length}`); }
  if (category && category !== 'all') { params.push(category); conditions.push(`w.category=$${params.length}`); }

  const order = sort === 'oldest' ? 'ASC' : 'DESC';
  const { rows } = await pool.query(
    `SELECT w.*, p.name AS property_name, u.unit_number, t.name AS tradesman_name
     FROM work_orders w
     LEFT JOIN units u ON u.id=w.unit_id
     LEFT JOIN properties p ON p.id=w.property_id
     LEFT JOIN tradesmen t ON t.id=w.assigned_to
     WHERE ${conditions.join(' AND ')}
     ORDER BY w.created_at ${order}`,
    params
  );
  res.json(rows);
});

router.get('/work-orders/:id', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT w.*, p.name AS property_name, u.unit_number, t.name AS tradesman_name,
            b.scheduled_date, b.scheduled_time,
            c.rating, c.feedback, c.signed_off_at
     FROM work_orders w
     LEFT JOIN units u ON u.id=w.unit_id
     LEFT JOIN properties p ON p.id=w.property_id
     LEFT JOIN tradesmen t ON t.id=w.assigned_to
     LEFT JOIN bookings b ON b.work_order_id=w.id
     LEFT JOIN completions c ON c.work_order_id=w.id
     WHERE w.id=$1 AND w.landlord_id=$2`,
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.patch('/work-orders/:id', auth, async (req, res) => {
  const { status, priority, notes, assigned_to } = req.body;
  const now = new Date().toISOString();
  const timestamps = {};
  if (status === 'accepted') timestamps.accepted_at = now;
  if (status === 'in_progress') timestamps.assigned_at = now;
  if (status === 'completed') timestamps.completed_at = now;
  if (status === 'closed') timestamps.closed_at = now;

  const sets = [];
  const params = [];
  if (status) { params.push(status); sets.push(`status=$${params.length}`); }
  if (priority) { params.push(priority); sets.push(`priority=$${params.length}`); }
  if (notes !== undefined) { params.push(notes); sets.push(`notes=$${params.length}`); }
  if (assigned_to !== undefined) { params.push(assigned_to || null); sets.push(`assigned_to=$${params.length}`); }
  Object.entries(timestamps).forEach(([k, v]) => { params.push(v); sets.push(`${k}=$${params.length}`); });
  params.push(now); sets.push(`updated_at=$${params.length}`);
  params.push(req.params.id);
  params.push(req.user.id);

  await pool.query(
    `UPDATE work_orders SET ${sets.join(',')} WHERE id=$${params.length-1} AND landlord_id=$${params.length}`,
    params
  );

  // Notify tenant when status changes
  if (status) {
    const { rows } = await pool.query('SELECT * FROM work_orders WHERE id=$1', [req.params.id]);
    if (rows.length) {
      const messages = {
        accepted: 'Your work order has been accepted and is being reviewed.',
        in_progress: 'A tradesman has been assigned to your work order.',
        scheduled: 'Your repair has been scheduled. Please check your tracking link to book a time.',
        completed: 'Your repair is marked complete. Please sign off via your tracking link.',
        closed: 'Your work order has been closed.'
      };
      if (messages[status]) {
        await pool.query(
          'INSERT INTO notifications (user_id, message, link) SELECT id, $1, $2 FROM users WHERE email=$3',
          [messages[status], `/track/${rows[0].track_token}`, rows[0].tenant_email]
        ).catch(() => {});
      }
    }
  }

  res.json({ success: true });
});

// ── Stats ────────────────────────────────────────────────────
router.get('/stats', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE status='pending')         AS pending,
      COUNT(*) FILTER (WHERE status='in_progress')     AS "inProgress",
      COUNT(*) FILTER (WHERE status='completed')       AS completed,
      COUNT(*) FILTER (WHERE status='closed')          AS closed
    FROM work_orders WHERE landlord_id=$1
  `, [req.user.id]);
  const r = rows[0];
  res.json({
    total: Number(r.total), pending: Number(r.pending),
    inProgress: Number(r.inProgress), completed: Number(r.completed), closed: Number(r.closed)
  });
});

// ── Notifications ────────────────────────────────────────────
router.get('/notifications', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(rows);
});

router.post('/notifications/read', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET read=true WHERE user_id=$1', [req.user.id]);
  res.json({ success: true });
});

module.exports = router;
