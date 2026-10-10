const form = document.querySelector('#availability-form');
const checkInInput = document.querySelector('#check-in');
const checkOutInput = document.querySelector('#check-out');
const searchButton = document.querySelector('#search-button');
const resultsList = document.querySelector('#results-list');
const emptyState = document.querySelector('#empty-state');
const emptyTitle = document.querySelector('#empty-title');
const emptyDescription = document.querySelector('#empty-description');
const resultCount = document.querySelector('#result-count');
const pageMessage = document.querySelector('#page-message');
const logoutButton = document.querySelector('#logout-button');
const logoutError = document.querySelector('#logout-error');
const sidebar = document.querySelector('#sidebar');
const mobileScrim = document.querySelector('#mobile-scrim');

const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString()
  .slice(0, 10);
checkInInput.min = localDate;
checkOutInput.min = localDate;
checkInInput.value = localDate;

const dateLabels = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
});
const typeLabels = { ESTANDAR: 'Estándar', DOBLE: 'Doble', FAMILIAR: 'Familiar', SUITE: 'Suite' };

checkInInput.addEventListener('change', () => {
  checkOutInput.min = checkInInput.value || localDate;
  if (checkOutInput.value && checkOutInput.value <= checkInInput.value) {
    checkOutInput.value = '';
  }
});

function showRoom(room) {
  const item = document.createElement('article');
  item.className = 'room-result';

  const name = document.createElement('div');
  name.className = 'room-result-name';
  const mark = document.createElement('span');
  mark.className = 'room-result-mark';
  mark.textContent = 'H';
  const title = document.createElement('div');
  const number = document.createElement('strong');
  number.textContent = `Habitación ${room.number}`;
  const type = document.createElement('small');
  type.textContent = typeLabels[room.type] || room.type;
  title.append(number, type);
  name.append(mark, title);

  const capacity = document.createElement('span');
  capacity.className = 'room-result-capacity';
  capacity.textContent = `Hasta ${room.capacity} huéspedes`;
  const rate = document.createElement('strong');
  rate.className = 'room-result-rate';
  rate.textContent = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(room.rate);
  const perNight = document.createElement('small');
  perNight.textContent = 'por noche';
  rate.append(perNight);

  item.append(name, capacity, rate);
  return item;
}

function displayDate(date) {
  return dateLabels.format(new Date(`${date}T00:00:00.000Z`));
}

async function search(event) {
  event.preventDefault();
  pageMessage.textContent = '';
  searchButton.disabled = true;
  searchButton.textContent = 'Consultando...';

  const params = new URLSearchParams({
    checkIn: checkInInput.value,
    checkOut: checkOutInput.value,
    guestCount: form.elements.guestCount.value
  });
  if (form.elements.roomType.value) params.set('roomType', form.elements.roomType.value);

  try {
    const response = await fetch(`/api/availability?${params}`, { credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'No fue posible consultar la disponibilidad.');

    const { rooms, criteria } = result;
    resultsList.replaceChildren(...rooms.map(showRoom));
    emptyState.hidden = rooms.length > 0;
    resultCount.textContent = `${rooms.length} ${rooms.length === 1 ? 'habitación' : 'habitaciones'}`;
    if (rooms.length === 0) {
      emptyTitle.textContent = 'No hay habitaciones para esos criterios';
      emptyDescription.textContent = 'Prueba otras fechas, reduce el número de huéspedes o selecciona otro tipo.';
    }
    document.querySelector('#results-title').textContent =
      `Disponibles del ${displayDate(criteria.checkIn)} al ${displayDate(criteria.checkOut)}`;
  } catch (error) {
    pageMessage.textContent = error.message;
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = 'Consultar disponibilidad';
  }
}

form.addEventListener('submit', search);
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
