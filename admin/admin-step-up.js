'use strict';

(() => {
  const dialog = document.querySelector('#adminStepUpDialog');
  const form = document.querySelector('#adminStepUpForm');
  const status = document.querySelector('#adminStepUpStatus');
  const password = document.querySelector('#adminStepUpPassword');
  const code = document.querySelector('#adminStepUpCode');
  const submit = document.querySelector('#adminStepUpSubmit');
  const cancel = document.querySelector('#adminStepUpCancel');
  const apiBase = (document.querySelector('meta[name="rafa-api-base"]')?.content.trim() || '').replace(/\/$/, '');
  let resolveVerification = null;

  async function verifyCredentials() {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    });
    const response = await fetch(`${apiBase}/api/admin/auth/step-up`, {
      method: 'POST',
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ password: password.value, code: code.value.trim() })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = result.error;
      throw new Error(error?.message || result.message ||
        (typeof error === 'string' ? error : 'Verification failed.'));
    }
  }

  function requestVerification() {
    if (dialog.open) return Promise.reject(new Error('Verification is already in progress.'));
    status.textContent = '';
    password.value = '';
    code.value = '';
    dialog.showModal();
    password.focus();
    return new Promise((resolve) => {
      resolveVerification = resolve;
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    status.textContent = 'Verifying…';
    try {
      await verifyCredentials();
      status.textContent = '';
      dialog.close();
      resolveVerification?.(true);
    } catch (error) {
      password.value = '';
      code.value = '';
      status.textContent = error.message;
      password.focus();
    } finally {
      submit.disabled = false;
    }
  });

  cancel.addEventListener('click', () => {
    dialog.close();
    resolveVerification?.(false);
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
    resolveVerification?.(false);
  });
  dialog.addEventListener('close', () => {
    password.value = '';
    code.value = '';
    resolveVerification = null;
  });

  window.rafaAdminStepUp = Object.freeze({
    async run(operation) {
      try {
        return await operation();
      } catch (error) {
        if (error.code !== 'reauthentication_required') throw error;
        if (!await requestVerification()) throw new Error('The change was cancelled.');
        return operation();
      }
    }
  });
})();
