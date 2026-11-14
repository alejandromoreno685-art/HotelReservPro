const logoutButton = document.querySelector('#logout-button');
const receiptMessage = document.querySelector('#receipt-message');
const reservationId = document.body.dataset.reservationId;
// Una clave por formulario: si el usuario reintenta tras un error de red, el
// servidor reconoce el mismo movimiento y no lo registra dos veces.
const pendingKeys = new WeakMap();

function showReceiptMessage(message, success = false) {
  if (!receiptMessage) return;
  receiptMessage.textContent = message;
  receiptMessage.classList.toggle('success', success);
}

function setFieldError(form, field, message) {
  const slot = form.querySelector(`.field-error[data-field="${field}"]`);
  const input = form.elements[field];
  if (slot) slot.textContent = message;
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validateEntry(form) {
  setFieldError(form, 'description', '');
  setFieldError(form, 'amount', '');
  let valid = true;
  const description = form.elements.description.value.trim();
  if (!description || description.length > 160) {
    setFieldError(form, 'description', 'Escribe un concepto de 1 a 160 caracteres.');
    valid = false;
  }
  const amount = form.elements.amount.value.trim();
  if (!/^\d+$/.test(amount) || Number(amount) < 1) {
    setFieldError(form, 'amount', 'Ingresa un valor entero en pesos mayor que cero.');
    valid = false;
  }
  return valid;
}

async function submitEntry(form, path, buttonLabel) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  showReceiptMessage('');
  if (!validateEntry(form)) return;
  button.disabled = true;
  button.textContent = 'Guardando...';
  if (!pendingKeys.has(form)) pendingKeys.set(form, crypto.randomUUID());
  const body = {
    description: form.elements.description.value.trim(),
    amount: form.elements.amount.value.trim()
  };
  try {
    const response = await fetch(`/api/receipts/${encodeURIComponent(reservationId)}/${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pendingKeys.get(form) },
      body: JSON.stringify(body)
    });
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.message || 'No fue posible guardar el movimiento.');
      error.status = response.status;
      throw error;
    }
    pendingKeys.delete(form);
    window.location.reload();
  } catch (error) {
    // Los datos escritos se conservan para corregirlos o reintentar.
    if (error.status === 400 || error.status === 409) {
      pendingKeys.delete(form);
      const field = /valor|anticipo supera|saldo/i.test(error.message) ? 'amount' : 'description';
      setFieldError(form, field, error.message);
    }
    showReceiptMessage(error.status ? error.message : 'No se pudo confirmar el guardado. Puedes reintentar: el movimiento no se duplicará.');
  } finally {
    button.disabled = false;
    button.textContent = buttonLabel;
  }
}

document.querySelector('#charge-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitEntry(event.currentTarget, 'charges', 'Guardar consumo');
});
document.querySelector('#payment-form')?.addEventListener('submit', (event) => {
  event.preventDefault();
  submitEntry(event.currentTarget, 'payments', 'Guardar anticipo');
});
for (const form of document.querySelectorAll('.entry-form')) {
  form.addEventListener('input', () => pendingKeys.delete(form));
}

logoutButton?.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('No fue posible cerrar la sesión.');
    window.location.assign('/login');
  } catch (error) {
    showReceiptMessage(error.message);
    logoutButton.disabled = false;
  }
});

document.querySelector('#menu-button')?.addEventListener('click', () => {
  document.querySelector('.sidebar')?.classList.toggle('open');
});
