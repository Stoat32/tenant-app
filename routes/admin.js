const router = require('express').Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const auth = requireAuth('admin');

// All work orders with full detail for Gantt
router.get('/work-orders', auth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT w.id, w.tenant_name, w.category, w.status, w.priority,
           w.created_at, w.accepted_at, w.assigned_at, w.scheduled_at, w.completed_at, w.closed_at,
           p.name AS property_name, u.unit_number,
           l.name AS landlord_name,
           t.name AS tradesman_name,
           c.rating
    FROM work_orders w
    LEFT JOIN properties p ON p.id=w.property_id
    LEFT JOIN units u ON u.id=w.unit_id
    LEFT JOIN users l ON l.id=w.landlord_id
    LEFT JOIN tradesmen t ON t.id=w.assigned_to
    LEFT JOIN completions c ON c.work_order_id=w.id
    ORDER BY w.created_at DESC
  `);
  res.json(rows);
});

// Summary stats
router.get('/stats', auth, async (req, res) => {
  const { rows: totals } = await pool.query(`
    SELECT
      COUNT(*)                                        AS total,
      COUNT(*) FILTER (WHERE status='pending')        AS pending,
      COUNT(*) FILTER (WHERE status='in_progress')    AS in_progress,
      COUNT(*) FILTER (WHERE status='scheduled')      AS scheduled,
      COUNT(*) FILTER (WHERE status='completed')      AS completed,
      COUNT(*) FILTER (WHERE status='closed')         AS closed,
      ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/3600)::numeric, 1) AS avg_accept_hours,
      ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600)::numeric, 1)  AS avg_resolve_hours,
      ROUND(AVG(c.rating)::numeric, 2) AS avg_rating
    FROM work_orders w
    LEFT JOIN completions c ON c.work_order_id=w.id
  `);

  const { rows: landlords } = await pool.query(`
    SELECT l.name AS landlord,
           COUNT(w.id) AS total,
           ROUND(AVG(EXTRACT(EPOCH FROM (w.closed_at - w.created_at))/3600)::numeric,1) AS avg_hours,
           ROUND(AVG(c.rating)::numeric,2) AS avg_rating
    FROM work_orders w
    JOIN users l ON l.id=w.landlord_id
    LEFT JOIN completions c ON c.work_order_id=w.id
    GROUP BY l.id, l.name ORDER BY total DESC
  `);

  res.json({ totals: totals[0], landlords });
});

// All landlords
router.get('/landlords', auth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,name,email,phone,created_at FROM users WHERE role='landlord' ORDER BY name"
  );
  res.json(rows);
});

module.exports = router;
