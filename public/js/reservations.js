const tableBody = document.querySelector('#reservations-table-body');
const emptyState = document.querySelector('#empty-state');
const emptyTitle = document.querySelector('#empty-title');
const emptyDescription = document.querySelector('#empty-description');
const pageMessage = document.querySelector('#page-message');
const statusFilter = document.querySelector('#status-filter');
const dialog = document.querySelector('#reservation-dialog');
const form = document.querySelector('#reservation-form');
const formError = document.querySelector('#form-error');
const guestSelect = document.querySelector('#guest-id');
const roomSelect = document.querySelector('#room-id');
const saveButton = document.querySelector('#save-reservation-button');
const searchButton = document.querySelector('#search-rooms-button');
const logoutButton = document.querySelector('#logout-button');
const logoutError = document.querySelector('#logout-error');
const sidebar = document.querySelector('#sidebar');
const mobileScrim = document.querySelector('#mobile-scrim');
const statusLabels = {
  PENDING_DEPOSIT: 'Pendiente',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada'
};
const documentLabels = { CC: 'CC', CE: 'CE', PASSPORT: 'Pasaporte', TI: 'TI', NIT: 'NIT', OTHER: 'Otro' };
let options = { guests: [], rooms: [] };
let activeReservationKey = null;
const hotelToday = document.body.dataset.hotelToday;
const pendingAttemptStorageKey = 'hotelreserve-pending-reservation';

function readPendingAttempt() {
  const value = sessionStorage.getItem(pendingAttemptStorageKey);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    sessionStorage.removeItem(pendingAttemptStorageKey);
    return null;
  }
}

const fieldIds = {
  checkIn: 'check-in',
  checkOut: 'check-out',
  guestCount: 'guest-count',
  guestId: 'guest-id',
  roomId: 'room-id'
};

function setFieldError(name, message) {
  const input = document.querySelector(`#${fieldIds[name]}`);
  const slot = document.querySelector(`#${fieldIds[name]}-error`);
  if (slot) slot.textContent = message;
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function clearFieldErrors() {
  for (const name of Object.keys(fieldIds)) setFieldError(name, '');
}

// Mismas reglas que el servidor; el servidor sigue siendo quien decide.
function validateFields({ requireSelection }) {
  clearFieldErrors();
  const { checkIn, checkOut, guestCount } = form.elements;
  let valid = true;
  if (!checkIn.value) {
    setFieldError('checkIn', 'Indica la fecha de entrada.');
    valid = false;
  } else if (checkIn.value < hotelToday) {
    setFieldError('checkIn', 'La entrada no puede ser anterior a hoy.');
    valid = false;
  }
  if (!checkOut.value) {
    setFieldError('checkOut', 'Indica la fecha de salida.');
    valid = false;
  } else if (checkIn.value && checkOut.value <= checkIn.value) {
    setFieldError('checkOut', 'La salida debe ser posterior a la entrada.');
    valid = false;
  }
  const count = Number(guestCount.value);
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    setFieldError('guestCount', 'Usa un número entero entre 1 y 12.');
    valid = false;
  }
  if (requireSelection) {
    if (!guestSelect.value) {
      setFieldError('guestId', 'Selecciona el huésped responsable.');
      valid = false;
    }
    if (!roomSelect.value) {
      setFieldError('roomId', 'Consulta y selecciona una habitación disponible.');
      valid = false;
    }
  }
  return valid;
}

// Ubica el mensaje del servidor junto al campo relacionado cuando es posible.
function showServerError(message) {
  const text = message || '';
  if (/entrada/i.test(text)) setFieldError('checkIn', text);
  else if (/salida/i.test(text)) setFieldError('checkOut', text);
  else if (/número de huéspedes|capacidad/i.test(text)) setFieldError('guestCount', text);
  else if (/huésped/i.test(text)) setFieldError('guestId', text);
  else if (/habitación/i.test(text)) setFieldError('roomId', text);
  formError.textContent = text;
}

function showMessage(message, success = false) {
  pageMessage.textContent = message;
  pageMessage.classList.toggle('success', success);
}

async function requestJson(url, requestOptions = {}) {
  const response = await fetch(url, {
    ...requestOptions,
    credentials: 'same-origin',
    headers: {
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...requestOptions.headers
    }
  });
  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('La sesión expiró. Inicia sesión nuevamente.');
  }
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(result?.message || 'No fue posible completar la operación.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function addCell(row, text, className) {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function addAction(actions, label, callback, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `row-action ${className}`.trim();
  button.textContent = label;
  button.addEventListener('click', callback);
  actions.append(button);
}

function reservationRow(reservation) {
  const row = document.createElement('tr');
  const guestCell = addCell(row, reservation.guestName, 'primary-cell');
  const subLabel = document.createElement('small');
  subLabel.className = 'sub-cell';
  subLabel.textContent = `${documentLabels[reservation.documentType] || reservation.documentType} · ${reservation.documentNumber}`;
  guestCell.append(subLabel);

  const roomCell = addCell(row, `Hab. ${reservation.roomNumber}`, 'primary-cell');
  const roomType = document.createElement('small');
  roomType.className = 'sub-cell';
  roomType.textContent = reservation.roomType;
  roomCell.append(roomType);
  addCell(row, formatDate(reservation.checkIn));
  addCell(row, formatDate(reservation.checkOut));
  addCell(row, String(reservation.guestCount));

  const statusCell = document.createElement('td');
  const status = document.createElement('span');
  status.className = `status-pill ${reservation.status.toLowerCase().replaceAll('_', '-')}`;
  status.textContent = statusLabels[reservation.status] || reservation.status;
  statusCell.append(status);
  row.append(statusCell);

  const actionsCell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  addAction(actions, 'Detalle', () => {
    window.location.assign(`/reservations/${encodeURIComponent(reservation.id)}`);
  });
  addAction(actions, 'Comprobante', () => {
    window.location.assign(`/receipts/${encodeURIComponent(reservation.id)}`);
  });
  if (reservation.status === 'PENDING_DEPOSIT') {
    addAction(actions, 'Confirmar', () => changeStatus(reservation, 'CONFIRMED'));
  }
  if (['PENDING_DEPOSIT', 'CONFIRMED'].includes(reservation.status)) {
    addAction(actions, 'Cancelar', () => cancelReservation(reservation), 'cancel');
  }
  actionsCell.append(actions);
  row.append(actionsCell);
  return row;
}

function formatDate(value) {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

async function loadReservations() {
  emptyState.hidden = true;
  tableBody.replaceChildren();
  const loadingRow = document.createElement('tr');
  const loadingCell = addCell(loadingRow, 'Cargando reservas...', 'loading-cell');
  loadingCell.colSpan = 7;
  tableBody.append(loadingRow);
  try {
    const status = statusFilter.value;
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const { reservations } = await requestJson(`/api/reservations${query}`);
    tableBody.replaceChildren(...reservations.map(reservationRow));
    emptyState.hidden = reservations.length > 0;
    if (reservations.length === 0) {
      emptyTitle.textContent = status ? 'No hay reservas con ese estado' : 'Todavía no hay reservas';
      emptyDescription.textContent = status
        ? 'Elige otro estado o crea una reserva nueva.'
        : 'Crea una reserva para verla en este listado.';
    }
  } catch (error) {
    tableBody.replaceChildren();
    emptyState.hidden = false;
    emptyTitle.textContent = 'No se pudieron cargar las reservas';
    emptyDescription.textContent = `${error.message} Actualiza la página para intentarlo de nuevo.`;
    showMessage(error.message);
  }
}

async function loadOptions() {
  const data = await requestJson('/api/reservations/options');
  options = data;
  guestSelect.replaceChildren(new Option('Selecciona un huésped', ''));
  for (const guest of options.guests) {
    guestSelect.add(new Option(`${guest.fullName} · ${documentLabels[guest.documentType] || guest.documentType} ${guest.documentNumber}`, guest.id));
  }
  if (options.guests.length === 0) {
    guestSelect.replaceChildren(new Option('Registra primero un huésped', ''));
  }
}

function resetForm() {
  form.reset();
  activeReservationKey = null;
  form.elements.guestCount.value = '1';
  form.elements.checkIn.value = hotelToday;
  form.elements.checkOut.value = addHotelDays(hotelToday, 1);
  formError.textContent = '';
  clearFieldErrors();
  roomSelect.disabled = true;
  roomSelect.replaceChildren(new Option('Consulta primero las fechas', ''));
}

function addHotelDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function openCreateDialog() {
  resetForm();
  try {
    await loadOptions();
    dialog.showModal();
    const pending = readPendingAttempt();
    if (pending) {
      activeReservationKey = pending.key;
      for (const [name, value] of Object.entries(pending.payload)) {
        if (form.elements[name]) form.elements[name].value = String(value);
      }
      await searchAvailableRooms();
      roomSelect.value = pending.payload.roomId;
      formError.textContent = 'Se conservó la solicitud anterior. Verifica su resultado antes de crear otra.';
      return;
    }
    form.elements.checkIn.focus();
  } catch (error) {
    showMessage(error.message);
  }
}

async function searchAvailableRooms() {
  if (!validateFields({ requireSelection: false })) {
    formError.textContent = 'Revisa los campos marcados.';
    return;
  }
  searchButton.disabled = true;
  searchButton.textContent = 'Consultando...';
  formError.textContent = '';
  roomSelect.disabled = true;
  roomSelect.replaceChildren(new Option('Buscando...', ''));
  const query = new URLSearchParams({
    checkIn: form.elements.checkIn.value,
    checkOut: form.elements.checkOut.value,
    guestCount: form.elements.guestCount.value
  });
  try {
    const { rooms } = await requestJson(`/api/reservations/available-rooms?${query}`);
    roomSelect.replaceChildren(new Option(
      rooms.length ? 'Selecciona una habitación' : 'No hay habitaciones disponibles',
      ''
    ));
    for (const room of rooms) {
      const rate = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
      }).format(room.rate);
      roomSelect.add(new Option(
        `Hab. ${room.number} · ${room.type} · ${room.capacity} huéspedes · ${rate}/noche`,
        room.id
      ));
    }
    roomSelect.disabled = rooms.length === 0;
    if (rooms.length === 0) setFieldError('roomId', 'No hay habitaciones disponibles para esas fechas y huéspedes.');
  } catch (error) {
    roomSelect.replaceChildren(new Option('No fue posible cargar habitaciones', ''));
    showServerError(error.message);
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = 'Consultar habitaciones disponibles';
  }
}

async function createReservation(event) {
  event.preventDefault();
  if (options.guests.length === 0) {
    formError.textContent = 'Registra primero un huésped para crear una reserva.';
    return;
  }
  formError.textContent = '';
  if (!validateFields({ requireSelection: true })) {
    formError.textContent = 'Revisa los campos marcados.';
    return;
  }
  if (saveButton.disabled) return;
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando...';
  if (!activeReservationKey) activeReservationKey = crypto.randomUUID();
  const body = {
    guestId: guestSelect.value,
    roomId: roomSelect.value,
    checkIn: form.elements.checkIn.value,
    checkOut: form.elements.checkOut.value,
    guestCount: Number(form.elements.guestCount.value)
  };
  sessionStorage.setItem(pendingAttemptStorageKey, JSON.stringify({
    key: activeReservationKey,
    payload: body
  }));

  try {
    await requestJson('/api/reservations', {
      method: 'POST',
      headers: { 'Idempotency-Key': activeReservationKey },
      body: JSON.stringify(body)
    });
    dialog.close();
    sessionStorage.removeItem(pendingAttemptStorageKey);
    activeReservationKey = null;
    showMessage('La reserva se creó en estado pendiente.', true);
    await loadReservations();
  } catch (error) {
    try {
      const { reservation } = await requestJson(
        `/api/reservations/idempotency/${encodeURIComponent(activeReservationKey)}`
      );
      dialog.close();
      sessionStorage.removeItem(pendingAttemptStorageKey);
      activeReservationKey = null;
      showMessage(`La reserva ${reservation.id} ya estaba guardada; se consultó su resultado.`, true);
      await loadReservations();
    } catch (reconciliationError) {
      if (reconciliationError.status === 404) {
        // No existe una reserva con esta clave: la solicitud no se guardó.
        sessionStorage.removeItem(pendingAttemptStorageKey);
        activeReservationKey = null;
        showServerError(error.message);
      } else {
        formError.textContent = `${error.message} No se pudo verificar el resultado; conserva esta solicitud y consulta las reservas antes de reintentar.`;
      }
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Crear reserva';
  }
}

async function changeStatus(reservation, status) {
  const label = statusLabels[status];
  if (!window.confirm(`¿Cambiar la reserva de ${reservation.guestName} al estado "${label}"?`)) return;
  try {
    await requestJson(`/api/reservations/${reservation.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    showMessage(`La reserva se actualizó: ${label.toLowerCase()}.`, true);
    await loadReservations();
  } catch (error) {
    showMessage(error.message);
  }
}

async function cancelReservation(reservation) {
  if (!window.confirm(`¿Cancelar la reserva de ${reservation.guestName} para la habitación ${reservation.roomNumber}?`)) return;
  try {
    await requestJson(`/api/reservations/${reservation.id}/cancel`, { method: 'POST' });
    showMessage('La reserva se canceló; la habitación queda liberada para esas fechas.', true);
    await loadReservations();
  } catch (error) {
    showMessage(error.message);
  }
}

async function reconcilePendingAttempt() {
  const pending = readPendingAttempt();
  if (!pending) return;
  try {
    const { reservation } = await requestJson(
      `/api/reservations/idempotency/${encodeURIComponent(pending.key)}`
    );
    sessionStorage.removeItem(pendingAttemptStorageKey);
    showMessage(`La reserva ${reservation.id} ya estaba guardada; se consultó su resultado.`, true);
    await loadReservations();
  } catch (error) {
    if (error.status !== 404) {
      showMessage('No se pudo verificar una solicitud anterior. Conserva el intento y consulta las reservas antes de volver a enviarlo.');
    }
  }
}

document.querySelector('#new-reservation-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#search-rooms-button').addEventListener('click', searchAvailableRooms);
form.addEventListener('submit', createReservation);
statusFilter.addEventListener('change', loadReservations);
// Cambiar fechas o huéspedes invalida la lista de habitaciones consultada.
for (const name of ['checkIn', 'checkOut', 'guestCount']) {
  form.elements[name].addEventListener('change', () => {
    activeReservationKey = null;
    sessionStorage.removeItem(pendingAttemptStorageKey);
    setFieldError(name, '');
    roomSelect.disabled = true;
    roomSelect.replaceChildren(new Option('Consulta otra vez las fechas', ''));
  });
}
// Elegir huésped o habitación solo cambia la solicitud (nueva clave), no la lista.
for (const name of ['guestId', 'roomId']) {
  form.elements[name].addEventListener('change', () => {
    activeReservationKey = null;
    sessionStorage.removeItem(pendingAttemptStorageKey);
    setFieldError(name, '');
  });
}
document.querySelector('#logout-button').addEventListener('click', async () => {
  logoutError.textContent = '';
  logoutButton.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('No fue posible cerrar la sesión.');
    window.location.assign('/login');
  } catch (error) {
    logoutError.textContent = error.message;
    logoutButton.disabled = false;
  }
});
function closeMenu() {
  sidebar.classList.remove('open');
  mobileScrim.classList.remove('visible');
}
document.querySelector('#menu-button').addEventListener('click', () => {
  sidebar.classList.toggle('open');
  mobileScrim.classList.toggle('visible');
});
mobileScrim.addEventListener('click', closeMenu);
loadReservations();
reconcilePendingAttempt();
