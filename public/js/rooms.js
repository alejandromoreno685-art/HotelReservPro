const tableBody = document.querySelector('#rooms-table-body');
const emptyState = document.querySelector('#empty-state');
const emptyTitle = document.querySelector('#empty-title');
const emptyDescription = document.querySelector('#empty-description');
const pageMessage = document.querySelector('#page-message');
const searchInput = document.querySelector('#search-input');
const statusFilter = document.querySelector('#status-filter');
const typeFilter = document.querySelector('#type-filter');
const dialog = document.querySelector('#room-dialog');
const form = document.querySelector('#room-form');
const formTitle = document.querySelector('#form-title');
const formError = document.querySelector('#form-error');
const saveButton = document.querySelector('#save-room-button');
const logoutButton = document.querySelector('#logout-button');
const logoutError = document.querySelector('#logout-error');
const sidebar = document.querySelector('#sidebar');
const mobileScrim = document.querySelector('#mobile-scrim');

const typeLabels = {
  ESTANDAR: 'Estándar',
  DOBLE: 'Doble',
  FAMILIAR: 'Familiar',
  SUITE: 'Suite'
};
const statusLabels = {
  DISPONIBLE: 'Disponible',
  EN_LIMPIEZA: 'En limpieza',
  MANTENIMIENTO: 'Mantenimiento',
  FUERA_DE_SERVICIO: 'Fuera de servicio'
};
const statusClasses = {
  DISPONIBLE: 'status-available',
  EN_LIMPIEZA: 'status-cleaning',
  MANTENIMIENTO: 'status-maintenance',
  FUERA_DE_SERVICIO: 'status-out'
};

let editingRoomId = null;
let searchTimer;

function showMessage(message, isSuccess = false) {
  pageMessage.textContent = message;
  pageMessage.classList.toggle('success', isSuccess);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  if (response.status === 401) {
    window.location.assign('/login');
    throw new Error('La sesión expiró. Inicia sesión nuevamente.');
  }
  if (response.status === 204) return null;

  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'No fue posible completar la operación.');
  return result;
}

function formatRate(rate) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(rate);
}

function createRoomRow(room) {
  const row = document.createElement('tr');

  const roomCell = document.createElement('td');
  const number = document.createElement('div');
  number.className = 'room-number';
  const mark = document.createElement('span');
  mark.className = 'room-number-mark';
  mark.textContent = 'H';
  const roomText = document.createElement('div');
  const roomName = document.createElement('strong');
  roomName.textContent = room.number;
  roomText.append(roomName);
  if (room.description) {
    const description = document.createElement('span');
    description.className = 'room-description';
    description.textContent = room.description;
    roomText.append(description);
  }
  number.append(mark, roomText);
  roomCell.append(number);

  const typeCell = document.createElement('td');
  typeCell.textContent = typeLabels[room.type] || room.type;
  const capacityCell = document.createElement('td');
  capacityCell.textContent = `${room.capacity} ${room.capacity === 1 ? 'huésped' : 'huéspedes'}`;
  const rateCell = document.createElement('td');
  rateCell.textContent = formatRate(room.rate);

  const statusCell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `status-badge ${statusClasses[room.status] || ''}`;
  badge.textContent = statusLabels[room.status] || room.status;
  statusCell.append(badge);

  const actionsCell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'row-action';
  editButton.textContent = 'Editar';
  editButton.addEventListener('click', () => openEditDialog(room));
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'row-action delete';
  deleteButton.textContent = 'Eliminar';
  deleteButton.addEventListener('click', () => removeRoom(room));
  actions.append(editButton, deleteButton);
  actionsCell.append(actions);

  row.append(roomCell, typeCell, capacityCell, rateCell, statusCell, actionsCell);
  return row;
}

function updateCounts(rooms) {
  document.querySelector('#total-count').textContent = rooms.length.toLocaleString('es-CO');
  document.querySelector('#available-count').textContent = rooms.filter(
    (room) => room.status === 'DISPONIBLE'
  ).length.toLocaleString('es-CO');
  document.querySelector('#cleaning-count').textContent = rooms.filter(
    (room) => room.status === 'EN_LIMPIEZA'
  ).length.toLocaleString('es-CO');
  document.querySelector('#maintenance-count').textContent = rooms.filter(
    (room) => room.status === 'MANTENIMIENTO'
  ).length.toLocaleString('es-CO');
}

async function loadRooms() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (statusFilter.value) params.set('status', statusFilter.value);
  if (typeFilter.value) params.set('type', typeFilter.value);
  const query = params.toString();

  try {
    const { rooms } = await requestJson(`/api/rooms${query ? `?${query}` : ''}`);
    tableBody.replaceChildren(...rooms.map(createRoomRow));
    emptyState.hidden = rooms.length > 0;
    if (rooms.length === 0) {
      const hasFilters = Boolean(searchInput.value.trim() || statusFilter.value || typeFilter.value);
      emptyTitle.textContent = hasFilters ? 'No se encontraron habitaciones' : 'Todavía no hay habitaciones';
      emptyDescription.textContent = hasFilters
        ? 'Prueba con otra búsqueda o cambia los filtros seleccionados.'
        : 'Registra habitaciones para empezar a preparar el inventario del hotel.';
    }
    if (!query) updateCounts(rooms);
  } catch (error) {
    if (error.message) showMessage(error.message);
  }
}

function openCreateDialog() {
  editingRoomId = null;
  form.reset();
  form.elements.status.value = 'DISPONIBLE';
  formTitle.textContent = 'Nueva habitación';
  saveButton.textContent = 'Guardar habitación';
  formError.textContent = '';
  dialog.showModal();
  form.elements.number.focus();
}

function openEditDialog(room) {
  editingRoomId = room.id;
  form.elements.number.value = room.number;
  form.elements.type.value = room.type;
  form.elements.capacity.value = room.capacity;
  form.elements.rate.value = room.rate;
  form.elements.status.value = room.status;
  form.elements.description.value = room.description;
  formTitle.textContent = `Editar habitación ${room.number}`;
  saveButton.textContent = 'Guardar cambios';
  formError.textContent = '';
  dialog.showModal();
  form.elements.number.focus();
}

async function saveRoom(event) {
  event.preventDefault();
  formError.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando...';

  const formData = new FormData(form);
  const room = {
    number: formData.get('number'),
    type: formData.get('type'),
    capacity: Number(formData.get('capacity')),
    rate: Number(formData.get('rate')),
    status: formData.get('status'),
    description: formData.get('description')
  };

  try {
    await requestJson(
      editingRoomId ? `/api/rooms/${editingRoomId}` : '/api/rooms',
      {
        method: editingRoomId ? 'PUT' : 'POST',
        body: JSON.stringify(room)
      }
    );
    dialog.close();
    showMessage(
      editingRoomId ? 'La habitación se actualizó correctamente.' : 'La habitación se registró correctamente.',
      true
    );
    await loadRooms();
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editingRoomId ? 'Guardar cambios' : 'Guardar habitación';
  }
}

async function removeRoom(room) {
  if (!window.confirm(`¿Seguro que deseas eliminar la habitación ${room.number}?`)) return;

  try {
    await requestJson(`/api/rooms/${room.id}`, { method: 'DELETE' });
    showMessage(`La habitación ${room.number} se eliminó.`, true);
    await loadRooms();
  } catch (error) {
    showMessage(error.message);
  }
}

document.querySelector('#new-room-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog-button').addEventListener('click', () => dialog.close());
form.addEventListener('submit', saveRoom);
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRooms, 250);
});
statusFilter.addEventListener('change', loadRooms);
typeFilter.addEventListener('change', loadRooms);

logoutButton.addEventListener('click', async () => {
  logoutError.textContent = '';
  logoutButton.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
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

loadRooms();
