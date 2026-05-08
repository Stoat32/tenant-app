const form = document.getElementById('workOrderForm');
const photoInput = document.getElementById('photo');
const preview = document.getElementById('photoPreview');
const placeholder = document.getElementById('uploadPlaceholder');
const message = document.getElementById('formMessage');
const submitBtn = document.getElementById('submitBtn');

photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
  };
  reader.readAsDataURL(file);
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  message.className = 'message hidden';

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  const data = new FormData(form);

  try {
    const res = await fetch('/api/work-orders', { method: 'POST', body: data });
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Submission failed');

    message.textContent = `Work order #${json.id} submitted successfully. Your landlord has been notified.`;
    message.className = 'message success';
    form.reset();
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    message.textContent = err.message;
    message.className = 'message error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Work Order';
  }
});
