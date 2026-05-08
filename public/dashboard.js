const categoryLabels = {
  plumbing: '🔧 Plumbing', electrical: '⚡ Electrical',
  heating_cooling: '🌡️ Heating/Cooling', structural: '🧱 Structural',
  appliances: '🍳 Appliances', pest: '🐛 Pest', security: '🔒 Security', other: '📋 Other'
};

let currentOrderId = null;

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function statusBadge(s) {
  return `<span class="badge badge-status-${s}">${s.replace('_', ' ')}</span>`;
}
function priorityBadge(p) {
  return `<span class="badge badge-priority-${p}">${p}</span>`;
}
function catBadge(c) {
  return `<span class="badge badge-cat">${categoryLabels[c] || c}</span>`;
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const s = await res.json();
  document.getElementById('statTotal').textContent = s.total;
  document.getElementById('statPending').textContent = s.pending;
  document.getElementById('statInProgress').textContent = s.inProgress;
  document.getElementById('statResolved').textContent = s.resolved;
}

async function loadOrders() {
  const status = document.getElementById('filterStatus').value;
  const category = document.getElementById('filterCategory').value;
  const sort = document.getElementById('filterSort').value;

  const params = new URLSearchParams({ status, category, sort });
  const res = await fetch('/api/work-orders?' + params);
  const orders = await res.json();

  const list = document.getElementById('orderList');

  if (!orders.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">✅</div><p>No work orders found.</p></div>`;
    return;
  }

  list.innerHTML = orders.map(o => `
    <div class="order-card ${o.status}" onclick="openModal(${o.id})">
      <div>
        <div class="order-meta">
          ${statusBadge(o.status)}
          ${priorityBadge(o.priority)}
          ${catBadge(o.category)}
        </div>
        <div class="order-title">Unit ${o.unit_number} — ${o.tenant_name}</div>
        <div class="order-desc">${escHtml(o.description)}</div>
        <div class="order-time">Submitted ${formatDate(o.created_at)}</div>
      </div>
      ${o.photo_path
        ? `<img class="order-thumb" src="/uploads/${o.photo_path}" alt="Photo" />`
        : ''}
    </div>
  `).join('');
}

async function openModal(id) {
  currentOrderId = id;
  const res = await fetch(`/api/work-orders/${id}`);
  const o = await res.json();

  document.getElementById('modalTitle').textContent = `Work Order #${o.id} — Unit ${o.unit_number}`;

  const photo = document.getElementById('modalPhoto');
  if (o.photo_path) {
    photo.src = `/uploads/${o.photo_path}`;
    photo.classList.remove('hidden');
  } else {
    photo.classList.add('hidden');
  }

  document.getElementById('modalDetails').innerHTML = `
    <div class="detail-row"><span class="detail-label">Tenant</span>${escHtml(o.tenant_name)}</div>
    <div class="detail-row"><span class="detail-label">Email</span>${escHtml(o.email)}</div>
    ${o.phone ? `<div class="detail-row"><span class="detail-label">Phone</span>${escHtml(o.phone)}</div>` : ''}
    <div class="detail-row"><span class="detail-label">Category</span>${categoryLabels[o.category] || o.category}</div>
    <div class="detail-row"><span class="detail-label">Submitted</span>${formatDate(o.created_at)}</div>
    <div class="detail-row"><span class="detail-label">Description</span><span>${escHtml(o.description)}</span></div>
  `;

  document.getElementById('modalStatus').value = o.status;
  document.getElementById('modalPriority').value = o.priority;
  document.getElementById('modalNotes').value = o.notes || '';
  document.getElementById('modalMessage').className = 'message hidden';

  document.getElementById('modalOverlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  currentOrderId = null;
}

async function saveOrder() {
  if (!currentOrderId) return;
  const msg = document.getElementById('modalMessage');

  const body = {
    status: document.getElementById('modalStatus').value,
    priority: document.getElementById('modalPriority').value,
    notes: document.getElementById('modalNotes').value
  };

  const res = await fetch(`/api/work-orders/${currentOrderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    msg.textContent = 'Changes saved.';
    msg.className = 'message success';
    loadOrders();
    loadStats();
  } else {
    msg.textContent = 'Failed to save. Please try again.';
    msg.className = 'message error';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Close modal on overlay click
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

loadStats();
loadOrders();
