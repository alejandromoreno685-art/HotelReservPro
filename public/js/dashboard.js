const metricElements = document.querySelectorAll('[data-metric]');
const dateElement = document.querySelector('#today-date');
const logoutButton = document.querySelector('#logout-button');
const logoutError = document.querySelector('#logout-error');
const summaryError = document.querySelector('#summary-error');
const menuButton = document.querySelector('#menu-button');
const sidebar = document.querySelector('#sidebar');
const mobileScrim = document.querySelector('#mobile-scrim');

dateElement.textContent = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
}).format(new Date());

async function loadSummary() {
  try {
    const response = await fetch('/api/dashboard/summary', { credentials: 'same-origin' });
    if (response.status === 401) {
      window.location.assign('/login');
      return;
    }
    if (!response.ok) throw new Error('No fue posible cargar el resumen.');

    const { summary } = await response.json();
    for (const element of metricElements) {
      const value = summary[element.dataset.metric];
      element.textContent = typeof value === 'number' ? value.toLocaleString('es-CO') : '—';
    }
  } catch (error) {
    for (const element of metricElements) element.textContent = '—';
    summaryError.textContent = 'No se pudo cargar el resumen. Actualiza la página para intentarlo nuevamente.';
    console.error(error);
  }
}

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
    logoutButton.disabled = false;
    logoutError.textContent = 'No fue posible cerrar la sesión. Intenta nuevamente.';
    console.error(error);
  }
});

function closeMenu() {
  sidebar.classList.remove('open');
  mobileScrim.classList.remove('visible');
}

menuButton.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  mobileScrim.classList.toggle('visible');
});
mobileScrim.addEventListener('click', closeMenu);

loadSummary();
