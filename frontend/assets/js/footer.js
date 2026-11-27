(function () {
  document.querySelectorAll('[data-footer-year]').forEach((yearNode) => {
    yearNode.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll('.shared-footer-newsletter').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const submit = form.querySelector('button[type="submit"]');
      const status = form.parentElement?.querySelector('.shared-footer-newsletter-status');
      if (!emailInput || !submit || !status) return;

      const configuredBase = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
      const localBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'http://localhost:3001'
        : '';
      const apiBase = (configuredBase || localBase).replace(/\/$/, '');
      submit.disabled = true;
      status.textContent = 'Saving your signup…';

      try {
        const response = await fetch(`${apiBase}/api/newsletter-subscriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput.value.trim() })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || result.error || `Request failed (${response.status}).`);
        }
        emailInput.value = '';
        status.textContent = 'Thanks for signing up. Your email was saved.';
      } catch (error) {
        console.error('Unable to save footer newsletter signup:', error);
        status.textContent = `${error.message} Your email is still here; please try again.`;
      } finally {
        submit.disabled = false;
      }
    });
  });
})();
