'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const elements = {
    view: $('#inboxView'),
    rows: $('#inboxRows'),
    status: $('#inboxStatus'),
    search: $('#inboxSearch'),
    type: $('#inboxTypeFilter'),
    pipeline: $('#inboxStatusFilter'),
    from: $('#inboxDateFrom'),
    to: $('#inboxDateTo'),
    assigneeFilter: $('#inboxAssigneeFilter'),
    sort: $('#inboxSort'),
    settingsLink: $('#inboxSettingsLink'),
    count: $('#inboxResultCount'),
    unread: $('#inboxUnreadCount'),
    previous: $('#inboxPrevious'),
    next: $('#inboxNext'),
    page: $('#inboxPage'),
    detail: $('#inboxDetail'),
    detailStatus: $('#inboxDetailStatus')
  };
  const configuredBase = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
  const apiBase = (configuredBase || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : ''
  )).replace(/\/$/, '');
  const state = { page: 1, total: 0, selectedId: null, requestId: 0, debounce: null };
  const statusLabels = {
    new: 'New',
    contacted: 'Contacted',
    quote_sent: 'Quote sent',
    confirmed: 'Confirmed',
    completed: 'Completed',
    lost: 'Lost',
    declined: 'Declined'
  };
  const typeLabels = { events: 'Events', desserts: 'Desserts', general: 'General', apparels: 'Apparel' };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, kind = '') {
    elements.status.textContent = message;
    elements.status.dataset.state = kind;
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set('Content-Type', 'application/json');
    if ((options.method || 'GET').toUpperCase() !== 'GET') {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.error?.message || result.message || result.error || `Request failed (${response.status}).`;
      throw new Error(message);
    }
    return result;
  }

  function queryString() {
    const values = {
      q: elements.search.value.trim(),
      type: elements.type.value,
      status: elements.pipeline.value,
      from: elements.from.value,
      to: elements.to.value,
      assignee: elements.assigneeFilter.value,
      sort: elements.sort.value,
      direction: 'desc',
      page: state.page,
      limit: 25
    };
    const query = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== '' && value !== null) query.set(key, String(value));
    });
    return query.toString();
  }

  function renderRows(items) {
    const body = document.createDocumentFragment();
    if (!items.length) {
      const row = node('tr');
      const cell = node('td', 'inbox-empty-cell', 'No inquiries match these filters.');
      cell.colSpan = 6;
      row.append(cell);
      body.append(row);
    }
    for (const inquiry of items) {
      const row = node('tr', inquiry.id === state.selectedId ? 'is-selected' : '');
      const customer = node('td', 'inbox-customer-cell');
      const open = node('button', 'inbox-open-item', inquiry.name);
      open.type = 'button';
      open.setAttribute('aria-label', `Open inquiry from ${inquiry.name}`);
      open.addEventListener('click', () => loadDetail(inquiry.id));
      customer.append(open, node('small', '', inquiry.email));
      if (!inquiry.is_read) customer.append(node('span', 'inbox-unread-dot', 'Unread'));
      row.append(
        customer,
        node('td', '', typeLabels[inquiry.type] || inquiry.type),
        node('td', '', statusLabels[inquiry.status] || inquiry.status),
        node('td', '', new Date(inquiry.created_at).toLocaleDateString()),
        node('td', '', inquiry.assignee_name || 'Unassigned'),
        node('td', inquiry.follow_up_due ? 'inbox-followup-due' : '', inquiry.follow_up_due ? 'Follow-up due' : '—')
      );
      body.append(row);
    }
    elements.rows.replaceChildren(body);
  }

  async function loadList() {
    const requestId = ++state.requestId;
    setStatus('Loading inquiries…');
    try {
      const result = await request(`/api/admin/inquiries?${queryString()}`);
      if (requestId !== state.requestId) return;
      state.total = result.meta.total;
      renderRows(result.data);
      elements.unread.textContent = String(result.meta.unread);
      $('#inboxNavUnread').textContent = String(result.meta.unread);
      $('#inboxNavUnread').hidden = result.meta.unread === 0;
      elements.count.textContent = `${result.meta.total} ${result.meta.total === 1 ? 'inquiry' : 'inquiries'}`;
      const pageCount = Math.max(1, Math.ceil(result.meta.total / 25));
      elements.page.textContent = `Page ${state.page} of ${pageCount}`;
      elements.previous.disabled = state.page <= 1;
      elements.next.disabled = state.page >= pageCount;
      setStatus('');
    } catch (error) {
      renderRows([]);
      elements.settingsLink.hidden = !error.message.toLowerCase().includes('unauthorized');
      setStatus(error.message.includes('unauthorized')
        ? 'Sign in through Settings to open the Inbox.'
        : error.message, 'error');
    }
  }

  function addContactAction(container, label, href, disabled) {
    const link = node('a', `inbox-contact-action${disabled ? ' is-disabled' : ''}`, label);
    if (disabled) {
      link.setAttribute('aria-disabled', 'true');
      link.removeAttribute('href');
    } else {
      link.href = href;
      if (href.startsWith('https:')) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    }
    container.append(link);
  }

  function renderDetails(inquiry) {
    const root = document.createDocumentFragment();
    const heading = node('header', 'inbox-detail-heading');
    const title = node('div');
    title.append(node('p', 'page-eyebrow', `${typeLabels[inquiry.type] || inquiry.type} inquiry`));
    title.append(node('h2', '', inquiry.name));
    title.append(node('p', 'inbox-detail-contact', inquiry.email));
    heading.append(title);
    const phone = String(inquiry.phone || '').replace(/[^\d+]/g, '');
    const contacts = node('div', 'inbox-contact-actions');
    addContactAction(contacts, 'Call', phone ? `tel:${phone}` : '', !phone);
    addContactAction(contacts, 'WhatsApp', phone ? `https://wa.me/${phone.replace(/\D/g, '')}` : '', !phone);
    heading.append(contacts);
    root.append(heading);

    const pipeline = node('section', 'inbox-detail-section');
    pipeline.append(node('h3', '', 'Pipeline'));
    const updateForm = node('form', 'inbox-update-form');
    const statusLabel = node('label');
    statusLabel.append(node('span', '', 'Status'));
    const statusSelect = node('select');
    statusSelect.id = 'inboxDetailStatusSelect';
    Object.entries(statusLabels).forEach(([value, label]) => {
      const option = node('option', '', label);
      option.value = value;
      option.selected = value === inquiry.status;
      statusSelect.append(option);
    });
    statusLabel.append(statusSelect);
    const reasonLabel = node('label', 'inbox-reason-field');
    reasonLabel.hidden = true;
    reasonLabel.append(node('span', '', 'Required reason'));
    const reasonInput = node('input');
    reasonInput.maxLength = 500;
    reasonInput.name = 'reason';
    reasonInput.required = true;
    reasonLabel.append(reasonInput);
    const saveStatus = node('button', 'inbox-primary-button', 'Update status');
    saveStatus.type = 'submit';
    updateForm.append(statusLabel, reasonLabel, saveStatus);
    statusSelect.addEventListener('change', () => {
      reasonLabel.hidden = !['lost', 'declined'].includes(statusSelect.value);
      reasonInput.required = !reasonLabel.hidden;
    });
    updateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      saveStatus.disabled = true;
      try {
        await request(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: statusSelect.value,
            reason: reasonLabel.hidden ? undefined : reasonInput.value.trim()
          })
        });
        setStatus('Pipeline updated.', 'success');
        await loadDetail(inquiry.id);
        await loadList();
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        saveStatus.disabled = false;
      }
    });
    const assignLabel = node('label');
    assignLabel.append(node('span', '', 'Assigned to'));
    const assignSelect = node('select');
    assignSelect.id = 'inboxAssigneeSelect';
    assignSelect.append(new Option('Unassigned', ''));
    for (const person of window.rafaInboxAssignees || []) {
      const option = new Option(person.display_name, person.id, false, person.id === inquiry.assignee_id);
      assignSelect.append(option);
    }
    assignLabel.append(assignSelect);
    assignSelect.addEventListener('change', async () => {
      assignSelect.disabled = true;
      try {
        await request(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ assigneeId: assignSelect.value || null })
        });
        setStatus('Assignee updated.', 'success');
        await loadDetail(inquiry.id);
        await loadList();
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        assignSelect.disabled = false;
      }
    });
    updateForm.append(assignLabel);
    pipeline.append(updateForm);
    root.append(pipeline);

    const summary = node('section', 'inbox-detail-section');
    summary.append(node('h3', '', 'Inquiry details'));
    if (inquiry.message) summary.append(node('p', 'inbox-message-text', inquiry.message));
    const details = node('dl', 'inbox-detail-fields');
    for (const [key, value] of Object.entries(inquiry.details || {})) {
      const row = node('div');
      row.append(node('dt', '', key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())));
      row.append(node('dd', '', Array.isArray(value) ? value.join(', ') : String(value)));
      details.append(row);
    }
    if (details.childElementCount) summary.append(details);
    if (inquiry.status_reason) summary.append(node('p', 'inbox-status-reason', `Reason: ${inquiry.status_reason}`));
    if (inquiry.follow_up_due) summary.append(node('p', 'inbox-followup-callout', 'This inquiry needs a follow-up.'));
    if (inquiry.attachments?.length) {
      const attachments = node('ul', 'inbox-attachments');
      for (const attachment of inquiry.attachments) {
        const item = node('li');
        if (attachment.signedUrl) {
          const link = node('a', '', attachment.file_name);
          link.href = attachment.signedUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.append(link);
        } else {
          item.textContent = attachment.file_name;
        }
        item.append(node('small', '', `${Math.ceil(attachment.file_size_bytes / 1024)} KB`));
        attachments.append(item);
      }
      summary.append(attachments);
    }
    root.append(summary);

    const templates = node('section', 'inbox-detail-section');
    templates.append(node('h3', '', 'Reply templates'));
    const templateSelect = node('select');
    templateSelect.setAttribute('aria-label', 'Reply template');
    templateSelect.append(new Option('Choose a template', ''));
    for (const template of window.rafaInboxTemplates || []) {
      const option = new Option(template.name, template.id);
      option.dataset.body = template.body.replaceAll('{{name}}', inquiry.name);
      templateSelect.append(option);
    }
    const templateText = node('textarea', 'inbox-template-preview');
    templateText.readOnly = true;
    templateText.rows = 4;
    const copyButton = node('button', 'inbox-secondary-button', 'Copy reply');
    copyButton.type = 'button';
    copyButton.disabled = true;
    templateSelect.addEventListener('change', () => {
      const option = templateSelect.selectedOptions[0];
      templateText.value = option?.dataset.body || '';
      copyButton.disabled = !templateText.value;
    });
    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(templateText.value);
        setStatus('Reply copied. You can paste it into your email or WhatsApp reply.', 'success');
      } catch (error) {
        setStatus(`Unable to copy reply: ${error.message}`, 'error');
      }
    });
    templates.append(templateSelect, templateText, copyButton);
    root.append(templates);

    const notes = node('section', 'inbox-detail-section');
    notes.append(node('h3', '', 'Internal notes'));
    const noteForm = node('form', 'inbox-note-form');
    const noteInput = node('textarea');
    noteInput.name = 'note';
    noteInput.maxLength = 2000;
    noteInput.required = true;
    noteInput.placeholder = 'Add a private note for the team…';
    const noteButton = node('button', 'inbox-primary-button', 'Add note');
    noteButton.type = 'submit';
    noteForm.append(noteInput, noteButton);
    noteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      noteButton.disabled = true;
      try {
        await request(`/api/admin/inquiries/${encodeURIComponent(inquiry.id)}/notes`, {
          method: 'POST',
          body: JSON.stringify({ note: noteInput.value.trim() })
        });
        await loadDetail(inquiry.id);
        setStatus('Note saved to the timeline.', 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        noteButton.disabled = false;
      }
    });
    notes.append(noteForm);
    const timeline = node('ol', 'inbox-timeline');
    for (const activity of inquiry.activity || []) {
      const item = node('li');
      const actor = activity.activity_type === 'submitted' ? 'Customer'
        : activity.activity_type === 'follow_up_reminder' ? 'System'
          : activity.actor_name || 'Team member';
      const activityTitle = {
        submitted: 'Inquiry received',
        status_changed: `Status changed${activity.metadata?.to ? ` to ${statusLabels[activity.metadata.to] || activity.metadata.to}` : ''}`,
        assigned: `Assigned${activity.content ? ` to ${activity.content}` : ''}`,
        note: 'Internal note',
        follow_up_reminder: 'Follow-up reminder'
      }[activity.activity_type] || 'Activity';
      item.append(node('strong', '', activityTitle));
      item.append(node('small', '', `${actor} · ${new Date(activity.created_at).toLocaleString()}`));
      if (activity.content) item.append(node('p', '', activity.content));
      timeline.append(item);
    }
    notes.append(timeline);
    root.append(notes);

    elements.detail.replaceChildren(root);
    elements.detail.hidden = false;
  }

  async function loadDetail(id) {
    state.selectedId = id;
    renderRowsForSelection();
    elements.detail.replaceChildren(node('p', 'inbox-loading', 'Loading inquiry details…'));
    try {
      const result = await request(`/api/admin/inquiries/${encodeURIComponent(id)}`);
      await renderDetails(result.data);
      elements.detailStatus.textContent = `Inquiry received ${new Date(result.data.created_at).toLocaleString()}`;
      await loadList();
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'inbox-error', error.message));
    }
  }

  function renderRowsForSelection() {
    const selected = elements.rows.querySelector('.is-selected');
    if (selected) selected.classList.remove('is-selected');
  }

  async function loadLookups() {
    try {
      const [assignees, templates] = await Promise.all([
        request('/api/admin/inquiries/assignees'),
        request('/api/admin/inquiries/reply-templates')
      ]);
      window.rafaInboxAssignees = assignees.data;
      window.rafaInboxTemplates = templates.data;
      elements.assigneeFilter.replaceChildren(new Option('All assignees', ''));
      for (const person of assignees.data) {
        elements.assigneeFilter.append(new Option(person.display_name, person.id));
      }
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function scheduleSearch() {
    state.page = 1;
    clearTimeout(state.debounce);
    state.debounce = setTimeout(loadList, 250);
  }

  [elements.search, elements.type, elements.pipeline, elements.from, elements.to,
    elements.assigneeFilter, elements.sort].forEach((input) =>
    input.addEventListener(input === elements.search ? 'input' : 'change', scheduleSearch)
  );
  elements.previous.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadList();
    }
  });
  elements.next.addEventListener('click', () => {
    if (state.page * 25 < state.total) {
      state.page += 1;
      loadList();
    }
  });
  $('#inboxRefresh').addEventListener('click', () => {
    loadLookups();
    loadList();
    if (state.selectedId) loadDetail(state.selectedId);
  });
  $('#inboxClearFilters').addEventListener('click', () => {
    [elements.search, elements.type, elements.pipeline, elements.from, elements.to,
      elements.assigneeFilter].forEach((input) => { input.value = ''; });
    elements.sort.value = 'created_at';
    state.page = 1;
    loadList();
  });
  $('#inboxSettingsLink').addEventListener('click', () => {
    document.querySelector('[data-nav="Settings"]').click();
  });
  window.addEventListener('rafa-inbox-opened', () => {
    elements.settingsLink.hidden = true;
    loadLookups();
    loadList();
  });
  window.addEventListener('rafa-inbox-search', (event) => {
    elements.search.value = event.detail?.q || '';
    scheduleSearch();
  });
})();
