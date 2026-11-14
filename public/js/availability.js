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

const localDate = document.body.dataset.hotelToday;
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

function setFieldError(id, message) {
  const slot = document.querySelector(`#${id}-error`);
  const input = document.querySelector(`#${id}`);
  if (slot) slot.textContent = message;
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validateSearch() {
  for (const id of ['check-in', 'check-out', 'guest-count']) setFieldError(id, '');
  let valid = true;
  if (!checkInInput.value) {
    setFieldError('check-in', 'Indica la fecha de entrada.');
    valid = false;
  } else if (checkInInput.value < localDate) {
    setFieldError('check-in', 'La entrada no puede ser anterior a hoy.');
    valid = false;
  }
  if (!checkOutInput.value) {
    setFieldError('check-out', 'Indica la fecha de salida.');
    valid = false;
  } else if (checkInInput.value && checkOutInput.value <= checkInInput.value) {
    setFieldError('check-out', 'La salida debe ser posterior a la entrada.');
    valid = false;
  }
  const count = Number(form.elements.guestCount.value);
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    setFieldError('guest-count', 'Usa un número entero entre 1 y 12.');
    valid = false;
  }
  return valid;
}

// Un fallo del servidor no debe verse como "sin habitaciones".
function showSearchError(message) {
  resultsList.replaceChildren();
  emptyState.hidden = false;
  resultCount.textContent = 'Error';
  emptyTitle.textContent = 'No se pudo completar la consulta';
  emptyDescription.textContent = 'El resultado no está disponible por un problema del servicio. Intenta nuevamente; esto no significa que no haya habitaciones.';
  pageMessage.textContent = message;
}

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
  if (!validateSearch()) return;
  searchButton.disabled = true;
  resultCount.textContent = 'Consultando...';
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
    if (response.status === 400) {
      // Error de datos: se muestra junto al campo y se conservan los valores.
      const message = result.message || 'Revisa los datos de la búsqueda.';
      if (/entrada/i.test(message)) setFieldError('check-in', message);
      else if (/salida|fechas/i.test(message)) setFieldError('check-out', message);
      else if (/huéspedes/i.test(message)) setFieldError('guest-count', message);
      pageMessage.textContent = message;
      resultCount.textContent = 'Sin consulta';
      return;
    }
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
    showSearchError(error.message);
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
