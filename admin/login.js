'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const loginForm = $('#adminLoginForm');
  const mfaForm = $('#adminMfaForm');
  const recovery = $('#adminRecovery');
  const status = $('#adminLoginStatus');
  const apiBase = ($('meta[name="rafa-api-base"]')?.content.trim() || '').replace(/\/$/, '');
  let mfaMode = '';
  let loginField = 'email';

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = result?.error;
      const message = error?.message || result?.message ||
        (typeof error === 'string' ? error : 'Sign-in could not be completed.');
      const failure = new Error(message);
      failure.status = response.status;
      throw failure;
    }
    return result;
  }

  function setStatus(message = '', state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  async function loadAuthConfig() {
    const config = await request('/api/admin/auth/config');
    loginField = config.loginField;
    const identity = $('#adminIdentity');
    identity.name = loginField;
    identity.type = loginField === 'email' ? 'email' : 'text';
    identity.maxLength = loginField === 'email' ? 254 : 32;
    if (loginField === 'email') {
      identity.removeAttribute('pattern');
    } else {
      identity.pattern = '[A-Za-z0-9._-]{3,32}';
    }
    identity.autocomplete = 'username';
    $('label[for="adminIdentity"]').textContent =
      loginField === 'email' ? 'Admin email' : 'Admin username';
  }

  function showMfa(mode, setup = null) {
    mfaMode = mode;
    loginForm.hidden = true;
    mfaForm.hidden = false;
    recovery.hidden = true;
    $('#adminMfaSetup').hidden = mode !== 'setup';
    $('#adminMfaSubmit').textContent = mode === 'setup'
      ? 'Enable MFA and continue'
      : 'Verify and continue';
    $('#adminMfaCode').value = '';
    if (setup) {
      $('#adminMfaQr').src = setup.qrCode;
      $('#adminMfaSecret').textContent = setup.secret;
    }
    $('#adminMfaCode').focus();
  }

  async function beginMfaSetup() {
    const setup = await request('/api/admin/auth/mfa/setup', { method: 'POST' });
    showMfa('setup', setup);
  }

  async function completeSignIn(recoveryCodes = []) {
    if (recoveryCodes.length) {
      mfaForm.hidden = true;
      recovery.hidden = false;
      $('#adminRecoveryCodes').textContent = recoveryCodes.join('\n');
      setStatus('MFA is enabled. Save your recovery codes before continuing.', 'success');
      return;
    }
    window.location.replace('/admin/');
  }

  async function checkSession() {
    loginForm.hidden = true;
    setStatus('Checking administrator session…');
    try {
      const session = await request('/api/admin/auth/session');
      if (session.authenticated) {
        window.location.replace('/admin/');
      } else if (session.mfaState === 'mfa_pending') {
        showMfa('verify');
        setStatus();
      } else if (session.mfaState === 'mfa_setup') {
        await beginMfaSetup();
        setStatus();
      } else {
        loginForm.hidden = false;
        setStatus();
      }
    } catch (error) {
      loginForm.hidden = false;
      setStatus(error.message);
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    const submit = $('#adminLoginSubmit');
    submit.disabled = true;
    setStatus('Signing in…');
    try {
      const result = await request('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          [loginField]: $('#adminIdentity').value.trim(),
          password: $('#adminPassword').value
        })
      });
      $('#adminPassword').value = '';
      if (result.mfaState === 'mfa_setup') await beginMfaSetup();
      else if (result.mfaState === 'mfa_pending') showMfa('verify');
      else throw new Error('Sign-in did not establish a valid administrator session.');
      setStatus();
    } catch (error) {
      $('#adminPassword').value = '';
      setStatus(error.message);
    } finally {
      submit.disabled = false;
    }
  });

  mfaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!mfaForm.reportValidity()) return;
    const submit = $('#adminMfaSubmit');
    submit.disabled = true;
    const code = $('#adminMfaCode').value.trim();
    setStatus(mfaMode === 'setup' ? 'Enabling MFA…' : 'Verifying MFA…');
    try {
      if (mfaMode === 'setup') {
        const result = await request('/api/admin/auth/mfa/confirm', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        await completeSignIn(result.recoveryCodes || []);
      } else {
        await request('/api/admin/auth/mfa/verify', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        await completeSignIn();
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      $('#adminMfaCode').value = '';
      submit.disabled = false;
    }
  });

  $('#adminRecoveryContinue').addEventListener('click', () => window.location.replace('/admin/'));
  loadAuthConfig().then(checkSession).catch((error) => {
    loginForm.hidden = false;
    setStatus(error.message);
  });
})();
