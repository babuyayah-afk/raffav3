(() => {
  const $ = (selector) => document.querySelector(selector);
  const panel = $('#testimonialReviewPanel');
  if (!panel) return;

  const configuredBase = $('meta[name="rafa-api-base"]')?.content.trim();
  const hostname = window.location.hostname;
  const apiBase = (configuredBase || (
    ['localhost', '127.0.0.1'].includes(hostname)
      ? `${window.location.protocol}//${hostname}:3001`
      : ''
  )).replace(/\/$/, '');
  const loginForm = $('#testimonialLoginForm');
  const mfaForm = $('#testimonialMfaForm');
  const queue = $('#testimonialReviewQueue');
  const submissionList = $('#testimonialSubmissionList');
  const status = $('#testimonialReviewStatus');
  let initialized = false;
  let mfaMode = '';
  let currentUser = null;
  let loginField = 'username';

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    const method = (options.method || 'GET').toUpperCase();
    if (options.body) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
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
      const message = result?.message || (
        result?.error === 'invalid_credentials'
          ? 'The email or username and password are incorrect.'
          : result?.error || `Request failed (${response.status}).`
      );
      const error = new Error(message);
      error.status = response.status;
      error.code = result?.error?.code || result?.code;
      throw error;
    }
    return result;
  }

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function showLogin() {
    currentUser = null;
    window.dispatchEvent(new CustomEvent('rafa-admin-signed-out'));
    mfaMode = '';
    loginForm.hidden = false;
    mfaForm.hidden = true;
    $('#testimonialMfaSetup').hidden = true;
    $('#testimonialRecoveryCodes').hidden = true;
    queue.hidden = true;
    $('#testimonialLogout').hidden = true;
    $('#testimonialRefresh').hidden = true;
  }

  function showMfaChallenge(mode, setup = null) {
    mfaMode = mode;
    loginForm.hidden = true;
    mfaForm.hidden = false;
    $('#testimonialRecoveryCodes').hidden = true;
    queue.hidden = true;
    $('#testimonialLogout').hidden = true;
    $('#testimonialRefresh').hidden = true;
    $('#testimonialMfaSetup').hidden = mode !== 'setup';
    $('#testimonialMfaLabel').textContent = 'Authenticator code or recovery code';
    $('#testimonialMfaSubmit').textContent = mode === 'setup'
      ? 'Enable MFA and continue'
      : 'Verify code';
    $('#testimonialMfaCode').placeholder = '6-digit code or recovery code';
    if (setup) {
      $('#testimonialMfaQr').src = setup.qrCode;
      $('#testimonialMfaSecret').textContent = setup.secret;
    }
    $('#testimonialMfaCode').value = '';
    $('#testimonialMfaCode').focus();
    setStatus(mode === 'setup'
      ? 'Set up an authenticator app to secure testimonial approvals.'
      : 'Enter a current authenticator code to continue.');
  }

  async function beginMfaSetup() {
    const setup = await request('/api/admin/auth/mfa/setup', { method: 'POST' });
    showMfaChallenge('setup', setup);
  }

  function renderSubmissions(items) {
    submissionList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'testimonial-review-role';
      empty.textContent = 'No testimonials are waiting for approval.';
      submissionList.append(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'testimonial-submission';
      const heading = document.createElement('header');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const time = document.createElement('time');
      time.dateTime = item.createdAt;
      const createdAt = new Date(item.createdAt);
      time.textContent = Number.isNaN(createdAt.getTime()) ? item.createdAt : createdAt.toLocaleString();
      heading.append(name, time);

      const quote = document.createElement('blockquote');
      quote.textContent = item.quote;
      card.append(heading, quote);
      if (item.detail) {
        const detail = document.createElement('small');
        detail.textContent = item.detail;
        card.append(detail);
      }

      if (currentUser && ['owner', 'manager'].includes(currentUser.role)) {
        const actions = document.createElement('div');
        actions.className = 'testimonial-submission-actions';
        [['approved', 'Approve'], ['rejected', 'Reject']].forEach(([value, label]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.testimonialId = item.id;
          button.dataset.status = value;
          button.textContent = label;
          actions.append(button);
        });
        card.append(actions);
      }
      submissionList.append(card);
    });
  }

  async function loadQueue() {
    try {
      const result = await request('/api/admin/testimonials?status=pending');
      const items = Array.isArray(result.items) ? result.items : [];
      renderSubmissions(items);
      $('#testimonialReviewRole').textContent = currentUser &&
        !['owner', 'manager'].includes(currentUser.role)
        ? 'Your account can review submissions, but only owners and managers can approve or reject them.'
        : 'Approve or reject each submission. Approved testimonials appear on the public homepage.';
      queue.hidden = false;
      $('#testimonialRefresh').hidden = false;
      $('#testimonialLogout').hidden = false;
      setStatus();
      return true;
    } catch (error) {
      console.error('Unable to load testimonial submissions:', error);
      if (error.status === 401 || error.status === 403) showLogin();
      setStatus(`${error.message} Please sign in again or retry.`, 'error');
      return false;
    }
  }

  async function showAuthenticated(user, recoveryCodes = []) {
    currentUser = user;
    window.dispatchEvent(new CustomEvent('rafa-admin-authenticated', { detail: { user } }));
    loginForm.hidden = true;
    mfaForm.hidden = true;
    $('#testimonialLogout').hidden = false;
    $('#testimonialRefresh').hidden = false;
    $('#testimonialMfaSetup').hidden = true;
    $('#testimonialMfaQr').removeAttribute('src');
    $('#testimonialMfaSecret').textContent = '';
    if (recoveryCodes.length) {
      $('#testimonialRecoveryCodeList').textContent = recoveryCodes.join('\n');
      $('#testimonialRecoveryCodes').hidden = false;
      queue.hidden = true;
      setStatus('MFA is enabled. Save your recovery codes before continuing.', 'success');
      return;
    }
    $('#testimonialRecoveryCodes').hidden = true;
    await loadQueue();
  }

  async function checkSession() {
    setStatus('Checking your admin session...');
    try {
      const authConfig = await request('/api/admin/auth/config');
      loginField = authConfig.loginField === 'email' ? 'email' : 'username';
      $('#testimonialAdminIdentifierLabel').textContent =
        loginField === 'email' ? 'Admin email' : 'Admin username';
      $('#testimonialAdminUsername').type = loginField === 'email' ? 'email' : 'text';
      $('#testimonialAdminUsername').autocomplete =
        loginField === 'email' ? 'email' : 'username';
      $('#testimonialAdminUsername').name = loginField;
      const session = await request('/api/admin/auth/session');
      if (session.authenticated) {
        await showAuthenticated(session.user);
      } else if (session.mfaState === 'mfa_pending') {
        showMfaChallenge('verify');
      } else if (session.mfaState === 'mfa_setup') {
        await beginMfaSetup();
      } else {
        showLogin();
        setStatus('Sign in with an admin account to review submissions.');
      }
    } catch (error) {
      console.error('Unable to check the testimonial reviewer session:', error);
      showLogin();
      setStatus(`${error.message} Confirm the admin API is available and retry.`, 'error');
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus('Signing in...');
    try {
      const values = new FormData(loginForm);
      const result = await request('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          [loginField]: values.get(loginField),
          password: values.get('password')
        })
      });
      $('#testimonialAdminPassword').value = '';
      if (result.mfaState === 'mfa_setup') {
        await beginMfaSetup();
      } else if (result.mfaState === 'mfa_pending') {
        showMfaChallenge('verify');
      } else if (result.authenticated) {
        await showAuthenticated(result.user);
      } else {
        throw new Error('The admin sign-in did not start a valid MFA session.');
      }
    } catch (error) {
      console.error('Unable to sign in to testimonial review:', error);
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  mfaForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#testimonialMfaSubmit');
    submit.disabled = true;
    setStatus(mfaMode === 'setup' ? 'Enabling MFA...' : 'Verifying code...');
    try {
      const code = $('#testimonialMfaCode').value.trim();
      if (mfaMode === 'setup') {
        const result = await request('/api/admin/auth/mfa/confirm', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        const session = await request('/api/admin/auth/session');
        if (!session.authenticated) throw new Error('MFA setup finished, but the admin session is not verified.');
        await showAuthenticated(session.user, result.recoveryCodes);
      } else if (mfaMode === 'verify') {
        const result = await request('/api/admin/auth/mfa/verify', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        await showAuthenticated(result.user);
      } else {
        throw new Error('Sign in again before entering an authenticator code.');
      }
    } catch (error) {
      console.error('Unable to verify admin MFA:', error);
      setStatus(error.message, 'error');
    } finally {
      $('#testimonialMfaCode').value = '';
      submit.disabled = false;
    }
  });

  $('#testimonialRecoveryContinue').addEventListener('click', async () => {
    $('#testimonialRecoveryCodes').hidden = true;
    await loadQueue();
  });

  $('#testimonialRefresh').addEventListener('click', loadQueue);

  $('#testimonialLogout').addEventListener('click', async () => {
    try {
      await request('/api/admin/auth/logout', { method: 'POST' });
      showLogin();
      setStatus('You have signed out.');
    } catch (error) {
      console.error('Unable to sign out of testimonial review:', error);
      setStatus(`${error.message} The admin session may still be active.`, 'error');
    }
  });

  submissionList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-testimonial-id][data-status]');
    if (!button) return;
    button.disabled = true;
    const statusValue = button.dataset.status;
    try {
      await window.rafaAdminStepUp.run(() =>
        request(`/api/admin/testimonials/${encodeURIComponent(button.dataset.testimonialId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: statusValue })
        })
      );
      const loaded = await loadQueue();
      if (loaded) {
        setStatus(statusValue === 'approved'
          ? 'Testimonial approved and published on the website.'
          : 'Testimonial rejected and kept off the website.', 'success');
      }
    } catch (error) {
      console.error('Unable to update testimonial review status:', error);
      if (error.status === 401 || error.status === 403) showLogin();
      setStatus(`${error.message} The submission was not changed.`, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#sideNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    panel.hidden = button.dataset.nav !== 'CMS';
    if (!panel.hidden && !initialized) {
      initialized = true;
      showLogin();
      checkSession();
    }
  });
})();
