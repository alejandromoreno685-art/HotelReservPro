const form = document.querySelector('#login-form');
const button = document.querySelector('#login-button');
const errorMessage = document.querySelector('#login-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';

  const formData = new FormData(form);
  button.disabled = true;
  button.querySelector('span').textContent = 'Validando acceso...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        username: formData.get('username'),
        password: formData.get('password')
      })
    });
    const result = await response.json();

    if (!response.ok) {
      errorMessage.textContent = result.message || 'No fue posible iniciar sesión.';
      return;
    }

    window.location.assign('/dashboard');
  } catch {
    errorMessage.textContent = 'No se pudo conectar con el servidor. Intenta nuevamente.';
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Entrar al panel';
  }
});
