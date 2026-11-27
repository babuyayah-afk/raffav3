(() => {
  const $ = (selector) => document.querySelector(selector);
  const view = $('#userManagementView');
  if (!view) return;

  const configuredBase = $('meta[name="rafa-api-base"]')?.content.trim();
  const hostname = window.location.hostname;
  const apiBase = (configuredBase || (
    ['localhost', '127.0.0.1'].includes(hostname)
      ? `${window.location.protocol}//${hostname}:3001`
      : ''
  )).replace(/\/$/, '');
  const status = $('#userManagementStatus');
  const authNotice = $('#userManagementAuth');
  const deniedNotice = $('#userManagementDenied');
  const profileCard = $('#userManagementProfile');
  const content = $('#userManagementContent');
  const rows = $('#userDirectoryRows');
  const inviteForm = $('#userInviteForm');
  const pageSize = 25;
  let page = 1;
  let total = 0;
  let roles = [];
  let users = [];
  let loading = false;
  let mfaMode = '';

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
      const errorDetails = result?.error;
      const message = errorDetails?.message || result?.message ||
        (typeof errorDetails === 'string' ? errorDetails : '') ||
        `Request failed (${response.status}).`;
      const error = new Error(message);
      error.status = response.status;
      error.code = errorDetails?.code || result?.code;
      throw error;
    }
    return result;
  }

  function setStatus(message = '', state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function showSignIn() {
    authNotice.hidden = false;
    profileCard.hidden = true;
    deniedNotice.hidden = true;
    content.hidden = true;
    $('#userManagementLoginForm').hidden = false;
    $('#userManagementMfaForm').hidden = true;
    $('#userManagementMfaSetup').hidden = true;
    $('#userManagementRecovery').hidden = true;
    $('#userManagementAuthTitle').textContent = 'Administrator sign-in';
    $('#userManagementAuthDescription').textContent =
      'Use an owner account and MFA to manage administrator access.';
  }

  function showMfaChallenge(mode, setup = null) {
    mfaMode = mode;
    authNotice.hidden = false;
    profileCard.hidden = true;
    deniedNotice.hidden = true;
    content.hidden = true;
    $('#userManagementLoginForm').hidden = true;
    $('#userManagementMfaForm').hidden = false;
    $('#userManagementRecovery').hidden = true;
    $('#userManagementMfaSetup').hidden = mode !== 'setup';
    $('#userManagementAuthTitle').textContent = mode === 'setup'
      ? 'Set up MFA'
      : 'MFA verification';
    $('#userManagementAuthDescription').textContent = mode === 'setup'
      ? 'Secure your administrator account before opening Settings.'
      : 'Enter a current authenticator code or recovery code.';
    $('#userManagementMfaSubmit').textContent = mode === 'setup'
      ? 'Enable MFA and continue'
      : 'Verify code';
    const mfaCode = $('#userManagementMfaCode');
    if (mode === 'setup') {
      mfaCode.pattern = '[0-9]{6}';
      mfaCode.inputMode = 'numeric';
      mfaCode.placeholder = '6-digit code';
      $('#userManagementMfaHint').textContent =
        'Enter exactly 6 digits from the authenticator app.';
    } else {
      mfaCode.pattern = '(?:[0-9]{6}|[A-Z0-9]{5}-[A-Z0-9]{5})';
      mfaCode.inputMode = 'text';
      mfaCode.placeholder = '6-digit code or XXXXX-XXXXX';
      $('#userManagementMfaHint').textContent =
        'Use 6 digits or a recovery code formatted XXXXX-XXXXX. Letters must be uppercase.';
    }
    if (setup) {
      $('#userManagementMfaQr').src = setup.qrCode;
      $('#userManagementMfaSecret').textContent = setup.secret;
    }
    $('#userManagementMfaCode').value = '';
    $('#userManagementMfaCode').focus();
  }

  async function beginMfaSetup() {
    const setup = await request('/api/admin/auth/mfa/setup', { method: 'POST' });
    showMfaChallenge('setup', setup);
  }

  async function showAuthenticated(user, recoveryCodes = []) {
    profileCard.hidden = false;
    $('#settingsProfileName').textContent = user.displayName || '—';
    $('#settingsProfileEmail').textContent = user.email || '—';
    $('#settingsProfileRole').textContent = roleLabel(user.role);
    $('#settingsProfileMfa').textContent = user.mfaEnabled ? 'Enabled' : 'Required';
    if (recoveryCodes.length) {
      authNotice.hidden = false;
      deniedNotice.hidden = true;
      content.hidden = true;
      $('#userManagementLoginForm').hidden = true;
      $('#userManagementMfaForm').hidden = true;
      $('#userManagementMfaSetup').hidden = true;
      $('#userManagementRecovery').hidden = false;
      $('#userManagementAuthTitle').textContent = 'MFA enabled';
      $('#userManagementAuthDescription').textContent =
        'Save these recovery codes before continuing.';
      $('#userManagementRecoveryCodes').textContent = recoveryCodes.join('\n');
      window.dispatchEvent(new CustomEvent('rafa-admin-authenticated', { detail: { user } }));
      return;
    }
    window.dispatchEvent(new CustomEvent('rafa-admin-authenticated', { detail: { user } }));
    if (user.role !== 'owner') {
      showDenied();
      setStatus();
      return;
    }
    showContent();
    await loadDirectory();
  }

  function roleLabel(role) {
    return ({
      owner: 'Owner',
      manager: 'Manager',
      support: 'Inquiry staff',
      catalogue_staff: 'Catalogue staff',
      viewer: 'Viewer'
    })[role] || role || '—';
  }

  function showDenied() {
    authNotice.hidden = true;
    deniedNotice.hidden = false;
    content.hidden = true;
  }

  function showContent() {
    authNotice.hidden = true;
    deniedNotice.hidden = true;
    content.hidden = false;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value || '—' : date.toLocaleDateString();
  }

  function createCell(text, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function makeRoleSelect(selectedKey) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Administrator role');
    roles.forEach((role) => {
      const option = document.createElement('option');
      option.value = role.roleKey;
      option.textContent = role.name;
      select.append(option);
    });
    select.value = selectedKey;
    return select;
  }

  function renderUsers() {
    rows.replaceChildren();
    if (!users.length) {
      const row = document.createElement('tr');
      const empty = createCell('No administrator accounts found.', 'user-directory-empty');
      empty.colSpan = 6;
      row.append(empty);
      rows.append(row);
    }

    users.forEach((user) => {
      const row = document.createElement('tr');
      row.dataset.search = `${user.email} ${user.displayName} ${user.roleName}`.toLowerCase();
      row.append(createCell(user.email));

      const nameCell = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.maxLength = 120;
      nameInput.pattern = '[^<>{}\\u0000-\\u001F]+';
      nameInput.title = 'Enter 1–120 characters without HTML, braces, or control characters.';
      nameInput.value = user.displayName;
      nameInput.setAttribute('aria-label', `Display name for ${user.email}`);
      nameCell.append(nameInput);
      row.append(nameCell);

      const roleCell = document.createElement('td');
      const roleSelect = makeRoleSelect(user.roleKey);
      roleCell.append(roleSelect);
      row.append(roleCell);

      const accessCell = document.createElement('td');
      const activeLabel = document.createElement('label');
      activeLabel.className = `user-access-state user-access-state--${user.active ? 'active' : 'inactive'}`;
      const activeInput = document.createElement('input');
      activeInput.type = 'checkbox';
      activeInput.checked = user.active;
      activeInput.setAttribute('aria-label', `Active access for ${user.email}`);
      const activeText = document.createElement('span');
      activeText.textContent = user.active ? 'Active' : 'Inactive';
      activeLabel.append(activeInput, activeText);
      accessCell.append(activeLabel);
      row.append(accessCell);
      row.append(createCell(formatDate(user.createdAt)));

      const actionCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'user-directory-actions';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'website-secondary';
      save.textContent = 'Save';
      save.disabled = true;
      actions.append(save);
      actionCell.append(actions);
      row.append(actionCell);

      const updateDirtyState = () => {
        activeText.textContent = activeInput.checked ? 'Active' : 'Inactive';
        activeLabel.className = `user-access-state user-access-state--${activeInput.checked ? 'active' : 'inactive'}`;
        save.disabled = nameInput.value.trim() === user.displayName &&
          roleSelect.value === user.roleKey &&
          activeInput.checked === user.active;
      };
      nameInput.addEventListener('input', updateDirtyState);
      roleSelect.addEventListener('change', updateDirtyState);
      activeInput.addEventListener('change', updateDirtyState);
      save.addEventListener('click', async () => {
        if (activeInput.checked === false && user.active &&
            !window.confirm(`Deactivate ${user.email}? They will lose admin access immediately.`)) return;
        const changes = {};
        const displayName = nameInput.value.trim();
        if (displayName !== user.displayName) changes.displayName = displayName;
        if (roleSelect.value !== user.roleKey) changes.roleKey = roleSelect.value;
        if (activeInput.checked !== user.active) changes.active = activeInput.checked;
        if (!Object.keys(changes).length) return;

        save.disabled = true;
        save.textContent = 'Saving…';
        try {
          await window.rafaAdminStepUp.run(() =>
            request(`/api/admin/auth/users/${encodeURIComponent(user.id)}`, {
              method: 'PATCH',
              body: JSON.stringify(changes)
            })
          );
          setStatus(`Updated access for ${user.email}.`, 'success');
          await loadDirectory(false);
        } catch (error) {
          console.error('Unable to update administrator account:', error);
          setStatus(error.message, 'error');
          save.textContent = 'Save';
          updateDirtyState();
        }
      });

      rows.append(row);
    });

    $('#userDirectoryCount').textContent = `${total} ${total === 1 ? 'account' : 'accounts'}`;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    $('#userDirectoryPage').textContent = `Page ${page} of ${pageCount}`;
    $('#userDirectoryPrevious').disabled = page <= 1 || loading;
    $('#userDirectoryNext').disabled = page >= pageCount || loading;
    applySearch($('#globalSearch').value.trim().toLowerCase());
  }

  function applySearch(query) {
    rows.querySelectorAll('tr[data-search]').forEach((row) => {
      row.hidden = Boolean(query) && !row.dataset.search.includes(query);
    });
  }

  async function loadDirectory(announce = true) {
    if (loading) return false;
    loading = true;
    $('#userManagementRefresh').disabled = true;
    $('#userInviteSubmit').disabled = true;
    if (announce) setStatus('Loading administrator accounts…');
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      const [roleResult, userResult] = await Promise.all([
        request('/api/admin/auth/roles'),
        request(`/api/admin/auth/users?${query}`)
      ]);
      roles = Array.isArray(roleResult?.data) ? roleResult.data : [];
      users = Array.isArray(userResult?.data) ? userResult.data : [];
      total = Number.isInteger(userResult?.meta?.total) ? userResult.meta.total : 0;
      const roleSelect = $('#userInviteRole');
      roleSelect.replaceChildren();
      roles.forEach((role) => {
        const option = document.createElement('option');
        option.value = role.roleKey;
        option.textContent = role.name;
        roleSelect.append(option);
      });
      $('#userInviteSubmit').disabled = roles.length === 0;
      renderUsers();
      if (announce) setStatus();
      return true;
    } catch (error) {
      console.error('Unable to load administrator accounts:', error);
      if (error.status === 401) showSignIn();
      else if (error.status === 403) showDenied();
      setStatus(error.message, 'error');
      return false;
    } finally {
      loading = false;
      $('#userManagementRefresh').disabled = false;
      if (roles.length) $('#userInviteSubmit').disabled = false;
      $('#userDirectoryPrevious').disabled = page <= 1;
      $('#userDirectoryNext').disabled = page >= Math.max(1, Math.ceil(total / pageSize));
    }
  }

  async function checkSession() {
    authNotice.hidden = true;
    deniedNotice.hidden = true;
    content.hidden = true;
    profileCard.hidden = true;
    setStatus('Checking owner sign-in…');
    try {
      const result = await request('/api/admin/auth/session');
      if (result.authenticated && result.user) {
        await showAuthenticated(result.user);
      } else if (result.mfaState === 'mfa_pending') {
        showMfaChallenge('verify');
        setStatus();
      } else if (result.mfaState === 'mfa_setup') {
        await beginMfaSetup();
        setStatus();
      } else {
        showSignIn();
        setStatus('Sign in with an owner account and complete MFA to manage users.');
      }
    } catch (error) {
      console.error('Unable to verify administrator session:', error);
      if (error.status === 401 || error.status === 403) showSignIn();
      setStatus(error.message, 'error');
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav]');
    if (!button) return;
    const isSettings = button.dataset.nav === 'Settings';
    view.hidden = !isSettings;
    if (isSettings) checkSession();
  });

  $('#userManagementRefresh').addEventListener('click', () => {
    page = 1;
    checkSession();
  });
  $('#userManagementSignOut').addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('rafa-admin-signout-request'));
  });
  $('#userManagementLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#userManagementLoginSubmit');
    submit.disabled = true;
    setStatus('Signing in…');
    try {
      const result = await request('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('#userManagementEmail').value.trim(),
          password: $('#userManagementPassword').value
        })
      });
      $('#userManagementPassword').value = '';
      if (result.mfaState === 'mfa_setup') {
        await beginMfaSetup();
        setStatus();
      } else if (result.mfaState === 'mfa_pending') {
        showMfaChallenge('verify');
        setStatus();
      } else if (result.authenticated) {
        await showAuthenticated(result.user);
        setStatus();
      } else {
        throw new Error('Sign-in did not establish a valid administrator session.');
      }
    } catch (error) {
      console.error('Unable to sign in to Settings:', error);
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
  $('#userManagementMfaForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#userManagementMfaSubmit');
    submit.disabled = true;
    setStatus(mfaMode === 'setup' ? 'Enabling MFA…' : 'Verifying MFA…');
    try {
      const code = $('#userManagementMfaCode').value.trim();
      if (mfaMode === 'setup') {
        const result = await request('/api/admin/auth/mfa/confirm', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        const session = await request('/api/admin/auth/session');
        if (!session.authenticated) {
          throw new Error('MFA setup completed, but the administrator session is not verified.');
        }
        await showAuthenticated(session.user, result.recoveryCodes || []);
        setStatus();
      } else {
        const result = await request('/api/admin/auth/mfa/verify', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        await showAuthenticated(result.user);
        setStatus();
      }
    } catch (error) {
      console.error('Unable to verify Settings MFA:', error);
      setStatus(error.message, 'error');
    } finally {
      submit.disabled = false;
      $('#userManagementMfaCode').value = '';
    }
  });
  $('#userManagementRecoveryContinue').addEventListener('click', async () => {
    const session = await request('/api/admin/auth/session').catch(() => null);
    if (session?.authenticated && session.user) {
      await showAuthenticated(session.user);
    }
  });
  $('#globalSearch').addEventListener('input', (event) => {
    if (!view.hidden) applySearch(event.target.value.trim().toLowerCase());
  });
  $('#userDirectoryPrevious').addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      loadDirectory();
    }
  });
  $('#userDirectoryNext').addEventListener('click', () => {
    if (page < Math.ceil(total / pageSize)) {
      page += 1;
      loadDirectory();
    }
  });
  inviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#userInviteSubmit');
    submit.disabled = true;
    submit.textContent = 'Sending…';
    setStatus('Sending invitation…');
    try {
      const result = await window.rafaAdminStepUp.run(() =>
        request('/api/admin/auth/users', {
          method: 'POST',
          body: JSON.stringify({
            email: $('#userInviteEmail').value.trim(),
            displayName: $('#userInviteName').value.trim(),
            roleKey: $('#userInviteRole').value
          })
        })
      );
      inviteForm.reset();
      page = 1;
      setStatus(`Invitation sent to ${result.data.email}.`, 'success');
      await loadDirectory(false);
    } catch (error) {
      console.error('Unable to invite administrator:', error);
      if (error.status === 401) showSignIn();
      else if (error.status === 403) showDenied();
      setStatus(error.message, 'error');
    } finally {
      submit.textContent = 'Send invitation';
      submit.disabled = roles.length === 0;
    }
  });

  window.addEventListener('rafa-admin-signed-out', () => {
    if (view.hidden) return;
    showSignIn();
    setStatus('You have signed out. Sign in again to manage administrator access.');
  });
})();
