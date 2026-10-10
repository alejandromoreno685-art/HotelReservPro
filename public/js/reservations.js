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
  if (!response.ok) throw new Error(result?.message || 'No fue posible completar la operación.');
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
  form.elements.guestCount.value = '1';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  form.elements.checkIn.value = localDateValue(today);
  form.elements.checkOut.value = localDateValue(tomorrow);
  formError.textContent = '';
  roomSelect.disabled = true;
  roomSelect.replaceChildren(new Option('Consulta primero las fechas', ''));
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function openCreateDialog() {
  resetForm();
  try {
    await loadOptions();
    dialog.showModal();
    form.elements.checkIn.focus();
  } catch (error) {
    showMessage(error.message);
  }
}

async function searchAvailableRooms() {
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
    if (rooms.length === 0) formError.textContent = 'No hay habitaciones disponibles para esos criterios.';
  } catch (error) {
    roomSelect.replaceChildren(new Option('No fue posible cargar habitaciones', ''));
    formError.textContent = error.message;
  }
}

async function createReservation(event) {
  event.preventDefault();
  if (options.guests.length === 0) {
    formError.textContent = 'Registra primero un huésped para crear una reserva.';
    return;
  }
  formError.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando...';
  const body = {
    guestId: guestSelect.value,
    roomId: roomSelect.value,
    checkIn: form.elements.checkIn.value,
    checkOut: form.elements.checkOut.value,
    guestCount: Number(form.elements.guestCount.value)
  };

  try {
    await requestJson('/api/reservations', { method: 'POST', body: JSON.stringify(body) });
    dialog.close();
    showMessage('La reserva se creó en estado pendiente.', true);
    await loadReservations();
  } catch (error) {
    formError.textContent = error.message;
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

document.querySelector('#new-reservation-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#search-rooms-button').addEventListener('click', searchAvailableRooms);
form.addEventListener('submit', createReservation);
statusFilter.addEventListener('change', loadReservations);
for (const name of ['checkIn', 'checkOut', 'guestCount']) {
  form.elements[name].addEventListener('change', () => {
    roomSelect.disabled = true;
    roomSelect.replaceChildren(new Option('Consulta otra vez las fechas', ''));
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
