const tableBody = document.querySelector('#guests-table-body');
const emptyState = document.querySelector('#empty-state');
const emptyTitle = document.querySelector('#empty-title');
const emptyDescription = document.querySelector('#empty-description');
const pageMessage = document.querySelector('#page-message');
const searchInput = document.querySelector('#search-input');
const dialog = document.querySelector('#guest-dialog');
const form = document.querySelector('#guest-form');
const formTitle = document.querySelector('#form-title');
const formError = document.querySelector('#form-error');
const saveButton = document.querySelector('#save-guest-button');
const logoutButton = document.querySelector('#logout-button');
const logoutError = document.querySelector('#logout-error');
const sidebar = document.querySelector('#sidebar');
const mobileScrim = document.querySelector('#mobile-scrim');

const documentLabels = {
  CC: 'CC',
  CE: 'CE',
  PASSPORT: 'Pasaporte',
  TI: 'TI',
  NIT: 'NIT',
  OTHER: 'Otro'
};
let editingGuestId = null;
let searchTimer;

function showMessage(message, success = false) {
  pageMessage.textContent = message;
  pageMessage.classList.toggle('success', success);
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

function guestRow(guest) {
  const row = document.createElement('tr');
  const guestCell = document.createElement('td');
  const name = document.createElement('span');
  name.className = 'guest-name';
  name.textContent = guest.fullName;
  guestCell.append(name);
  if (guest.foreignNonResident) {
    const foreign = document.createElement('span');
    foreign.className = 'foreign-label';
    foreign.textContent = 'Extranjero no residente';
    guestCell.append(document.createElement('br'), foreign);
  }

  const documentCell = document.createElement('td');
  documentCell.textContent = `${documentLabels[guest.documentType] || guest.documentType} · ${guest.documentNumber}`;
  const phoneCell = document.createElement('td');
  phoneCell.textContent = guest.phone;
  const emailCell = document.createElement('td');
  emailCell.textContent = guest.email;
  const countryCell = document.createElement('td');
  countryCell.textContent = guest.country;

  const actionsCell = document.createElement('td');
  const actions = document.createElement('div');
  actions.className = 'row-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'row-action';
  edit.textContent = 'Editar';
  edit.addEventListener('click', () => openEditDialog(guest));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'row-action delete';
  remove.textContent = 'Eliminar';
  remove.addEventListener('click', () => deleteGuest(guest));
  actions.append(edit, remove);
  actionsCell.append(actions);
  row.append(guestCell, documentCell, phoneCell, emailCell, countryCell, actionsCell);
  return row;
}

async function loadGuests() {
  const query = searchInput.value.trim();
  try {
    const { guests } = await requestJson(`/api/guests${query ? `?search=${encodeURIComponent(query)}` : ''}`);
    tableBody.replaceChildren(...guests.map(guestRow));
    emptyState.hidden = guests.length > 0;
    if (guests.length === 0) {
      emptyTitle.textContent = query ? 'No se encontraron huéspedes' : 'Todavía no hay huéspedes';
      emptyDescription.textContent = query
        ? 'Prueba con otro nombre, documento, teléfono o correo.'
        : 'Registra el primer huésped para empezar el directorio.';
    }
  } catch (error) {
    showMessage(error.message);
  }
}

function clearForm() {
  form.reset();
  formError.textContent = '';
}

function openCreateDialog() {
  editingGuestId = null;
  clearForm();
  formTitle.textContent = 'Nuevo huésped';
  saveButton.textContent = 'Guardar huésped';
  dialog.showModal();
  form.elements.fullName.focus();
}

function openEditDialog(guest) {
  editingGuestId = guest.id;
  form.elements.fullName.value = guest.fullName;
  form.elements.documentType.value = guest.documentType;
  form.elements.documentNumber.value = guest.documentNumber;
  form.elements.phone.value = guest.phone;
  form.elements.email.value = guest.email;
  form.elements.country.value = guest.country;
  form.elements.foreignNonResident.checked = guest.foreignNonResident;
  formTitle.textContent = `Editar huésped`;
  saveButton.textContent = 'Guardar cambios';
  formError.textContent = '';
  dialog.showModal();
  form.elements.fullName.focus();
}

async function saveGuest(event) {
  event.preventDefault();
  formError.textContent = '';
  saveButton.disabled = true;
  saveButton.textContent = 'Guardando...';
  const formData = new FormData(form);
  const guest = {
    fullName: formData.get('fullName'),
    documentType: formData.get('documentType'),
    documentNumber: formData.get('documentNumber'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    country: formData.get('country'),
    foreignNonResident: form.elements.foreignNonResident.checked
  };

  try {
    await requestJson(
      editingGuestId ? `/api/guests/${editingGuestId}` : '/api/guests',
      { method: editingGuestId ? 'PUT' : 'POST', body: JSON.stringify(guest) }
    );
    dialog.close();
    showMessage(editingGuestId ? 'Los datos del huésped se actualizaron.' : 'El huésped se registró correctamente.', true);
    await loadGuests();
  } catch (error) {
    formError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = editingGuestId ? 'Guardar cambios' : 'Guardar huésped';
  }
}

async function deleteGuest(guest) {
  if (!window.confirm(`¿Seguro que deseas eliminar el registro de ${guest.fullName}?`)) return;
  try {
    await requestJson(`/api/guests/${guest.id}`, { method: 'DELETE' });
    showMessage('El huésped se eliminó correctamente.', true);
    await loadGuests();
  } catch (error) {
    showMessage(error.message);
  }
}

document.querySelector('#new-guest-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog-button').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-dialog-button').addEventListener('click', () => dialog.close());
form.addEventListener('submit', saveGuest);
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadGuests, 250);
});
logoutButton.addEventListener('click', async () => {
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
loadGuests();
