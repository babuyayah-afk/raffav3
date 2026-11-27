'use strict';

(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const elements = {
    view: $('#operationsView'),
    title: $('#operationsTitle'),
    description: $('#operationsDescription'),
    create: $('#operationsCreate'),
    refresh: $('#operationsRefresh'),
    search: $('#operationsSearch'),
    searchLabel: $('#operationsSearchLabel'),
    statusLabel: $('#operationsStatusLabel'),
    status: $('#operationsStatusFilter'),
    tableHead: $('#operationsTableHead'),
    rows: $('#operationsRows'),
    count: $('#operationsCount'),
    listTitle: $('#operationsListTitle'),
    detail: $('#operationsDetail'),
    split: $('#operationsSplit'),
    calendar: $('#operationsCalendar'),
    calendarControls: $('#operationsCalendarControls'),
    calendarMode: $('#operationsCalendarMode'),
    calendarDate: $('#operationsCalendarDate'),
    statusMessage: $('#operationsStatus'),
    previous: $('#operationsPrevious'),
    next: $('#operationsNext'),
    page: $('#operationsPage'),
    summaryStatus: $('#operationsSummaryStatus')
  };
  const configuredBase = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
  const apiBase = (configuredBase || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : ''
  )).replace(/\/$/, '');
  const statusOptions = {
    Quotes: [
      ['', 'All quotes'], ['draft', 'Draft'], ['sent', 'Sent'],
      ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired']
    ],
    Bookings: [
      ['', 'All bookings'], ['scheduled', 'Scheduled'], ['confirmed', 'Confirmed'],
      ['completed', 'Completed'], ['cancelled', 'Cancelled']
    ]
  };
  const state = {
    view: 'Customers',
    page: 1,
    total: 0,
    search: '',
    status: '',
    selectedId: null,
    selectedKind: '',
    date: new Date(),
    calendarMode: 'month',
    pendingQuote: null,
    pendingBooking: null,
    navigateRecord: null,
    conflictReason: '',
    capacity: null,
    debounce: null
  };
  let validationErrorSequence = 0;
  const viewCopy = {
    Customers: ['Customers', 'One profile for each person, with their inquiries, quotes, and bookings.', 'New customer'],
    Quotes: ['Quotes', 'Build, send, and print service quotes linked to customers and inquiries.', 'New quote'],
    Bookings: ['Bookings', 'Manage confirmed event and dessert jobs, payments, and balances.', 'New booking'],
    Calendar: ['Calendar', 'Review month, week, or day schedules and resolve booking conflicts.', 'New booking']
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, kind = '') {
    elements.statusMessage.textContent = message;
    elements.statusMessage.dataset.state = kind;
  }

  function fieldTitle(field) {
    const name = field.split('.').filter(Boolean).pop() || 'Field';
    const titles = {
      agreedPriceMinor: 'Agreed price',
      amountMinor: 'Amount',
      bookingDate: 'Date',
      customerId: 'Customer',
      displayName: 'Full name',
      endTime: 'End time',
      inquiryId: 'Linked inquiry',
      limit: 'Maximum bookings per day',
      method: 'Payment method',
      overrideReason: 'Override reason',
      packageName: 'Package / service',
      paymentType: 'Payment type',
      startTime: 'Start time',
      unitPriceMinor: 'Unit price',
      validUntil: 'Valid until',
      venueAddress: 'Venue / delivery address'
    };
    return titles[name] || name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }

  function clearFieldValidation(form, control) {
    const errorId = control?.dataset.validationErrorId;
    if (!errorId) return;
    document.getElementById(errorId)?.remove();
    const describedBy = (control.getAttribute('aria-describedby') || '')
      .split(/\s+/).filter((id) => id && id !== errorId);
    if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
    else control.removeAttribute('aria-describedby');
    control.removeAttribute('aria-invalid');
    delete control.dataset.validationErrorId;
    const remaining = [...form.querySelectorAll('.operations-field-error')]
      .map((error) => error.textContent);
    setStatus(remaining.length ? remaining.join(' ') : '');
  }

  function clearFormValidation(form) {
    form.querySelectorAll('[data-validation-error-id]').forEach((control) =>
      clearFieldValidation(form, control));
    form.querySelectorAll('.operations-field-error').forEach((error) => error.remove());
  }

  function showValidationErrors(form, issues) {
    clearFormValidation(form);
    if (!form.dataset.validationFeedbackBound) {
      const clearEditedField = (event) => clearFieldValidation(form, event.target);
      form.addEventListener('input', clearEditedField);
      form.addEventListener('change', clearEditedField);
      form.dataset.validationFeedbackBound = 'true';
    }

    const messages = [];
    let firstInvalidControl = null;
    issues.forEach((issue) => {
      const field = String(issue.field || '');
      const message = String(issue.message || 'Check this value.');
      const title = fieldTitle(field);
      messages.push(`${title}: ${message}`);

      const pathParts = field.split('.').filter(Boolean);
      const fieldName = pathParts[pathParts.length - 1];
      const controls = [...form.elements].filter((control) => control.name === fieldName);
      const arrayIndex = pathParts.length > 2 ? Number(pathParts[pathParts.length - 2]) : 0;
      const control = controls[arrayIndex] || form.elements.namedItem(field);
      if (!control || typeof control.focus !== 'function') return;

      const wrapper = control.closest('.operations-field');
      if (!wrapper) return;
      const error = node('small', 'operations-field-error', message);
      error.id = `operations-validation-error-${++validationErrorSequence}`;
      wrapper.append(error);
      control.setAttribute('aria-invalid', 'true');
      control.dataset.validationErrorId = error.id;
      const describedBy = (control.getAttribute('aria-describedby') || '')
        .split(/\s+/).filter(Boolean);
      control.setAttribute('aria-describedby', [...describedBy, error.id].join(' '));
      firstInvalidControl = firstInvalidControl || control;
    });

    setStatus(messages.length
      ? `Please correct the highlighted fields. ${messages.join(' ')}`
      : 'Check the submitted fields.', 'error');
    firstInvalidControl?.focus();
  }

  function showFormError(error, form) {
    if (error.code === 'validation_failed' && Array.isArray(error.details) && error.details.length) {
      showValidationErrors(form, error.details);
      return;
    }
    setStatus(error.message, 'error');
  }

  function safeText(value) {
    return value == null ? '' : String(value);
  }

  function formatMoney(minor) {
    const amount = Number(minor);
    if (!Number.isFinite(amount)) return '—';
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount / 100);
  }

  function parseMoney(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000000) {
      throw new Error('Enter a valid KES amount.');
    }
    return Math.round(amount * 100);
  }

  function dateValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      const error = new Error(result.error?.message || result.message || `Request failed (${response.status}).`);
      error.status = response.status;
      error.code = result.error?.code;
      error.conflicts = result.conflicts;
      error.details = result.details;
      throw error;
    }
    return result;
  }

  function navTo(view) {
    const button = document.querySelector(`.nav-item[data-nav="${view}"]`);
    if (button) button.click();
  }

  function makeInput(labelText, name, value = '', options = {}) {
    const label = node('label', 'operations-field');
    label.append(node('span', '', labelText));
    const input = node(options.multiline ? 'textarea' : 'input', 'operations-control');
    input.name = name;
    input.value = value == null ? '' : String(value);
    if (options.type) input.type = options.type;
    if (options.required) input.required = true;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.step) input.step = options.step;
    if (options.min !== undefined) input.min = String(options.min);
    if (options.rows) input.rows = options.rows;
    if (options.placeholder) input.placeholder = options.placeholder;
    label.append(input);
    if (options.hint) {
      const hint = node('small', 'operations-field-hint', options.hint);
      hint.id = `operations-field-hint-${++validationErrorSequence}`;
      input.setAttribute('aria-describedby', hint.id);
      label.append(hint);
    }
    return { label, input };
  }

  function makeSelect(labelText, name, options, selected = '') {
    const label = node('label', 'operations-field');
    label.append(node('span', '', labelText));
    const select = node('select', 'operations-control');
    select.name = name;
    options.forEach(([value, title]) => {
      const option = new Option(title, value);
      option.selected = value === selected;
      select.append(option);
    });
    label.append(select);
    return { label, input: select };
  }

  function actionButton(label, action, className = 'website-secondary') {
    const button = node('button', className, label);
    button.type = 'button';
    button.dataset.operationAction = action;
    return button;
  }

  function statusBadge(value) {
    const badge = node('span', `operations-badge status-${String(value).replaceAll('_', '-')}`, value.replaceAll('_', ' '));
    return badge;
  }

  function buildToolbar() {
    const isCalendar = state.view === 'Calendar';
    const supportsStatus = Boolean(statusOptions[state.view]);
    elements.searchLabel.hidden = isCalendar;
    elements.statusLabel.hidden = isCalendar || !supportsStatus;
    elements.calendarControls.hidden = !isCalendar;
    elements.split.hidden = isCalendar;
    elements.calendar.hidden = !isCalendar;
    elements.create.hidden = state.view === 'Calendar';
    elements.create.textContent = viewCopy[state.view][2];
    elements.title.textContent = viewCopy[state.view][0];
    elements.description.textContent = viewCopy[state.view][1];
    elements.listTitle.textContent = viewCopy[state.view][0];
    elements.searchLabel.firstChild.textContent = `Search ${state.view.toLowerCase()}`;
    elements.search.value = state.search;
    elements.status.replaceChildren();
    (statusOptions[state.view] || []).forEach(([value, label]) =>
      elements.status.append(new Option(label, value, false, value === state.status))
    );
    elements.calendarMode.value = state.calendarMode;
    elements.calendarDate.value = dateValue(state.date);
    document.querySelectorAll('[data-operations-view]').forEach((tab) => {
      const selected = tab.dataset.operationsView === state.view;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
  }

  function setTableHeaders(columns) {
    const row = node('tr');
    columns.forEach((column) => row.append(node('th', '', column)));
    elements.tableHead.replaceChildren(row);
  }

  function rowButton(text, id, label) {
    const button = node('button', 'operations-row-link', text);
    button.type = 'button';
    button.dataset.recordId = id;
    button.setAttribute('aria-label', label || `Open ${text}`);
    return button;
  }

  function renderEmptyRow(message, columns) {
    const row = node('tr');
    const cell = node('td', 'operations-empty-cell', message);
    cell.colSpan = columns;
    row.append(cell);
    elements.rows.replaceChildren(row);
  }

  function updatePagination() {
    const pageCount = Math.max(1, Math.ceil(state.total / 25));
    elements.count.textContent = `${state.total} ${state.total === 1 ? 'record' : 'records'}`;
    elements.page.textContent = `Page ${state.page} of ${pageCount}`;
    elements.previous.disabled = state.page <= 1;
    elements.next.disabled = state.page >= pageCount;
  }

  function renderCustomerRows(items) {
    setTableHeaders(['Customer', 'Email', 'Phone', 'Updated']);
    if (!items.length) return renderEmptyRow('No customers match this search.', 4);
    const rows = items.map((customer) => {
      const row = node('tr');
      const name = node('td');
      name.append(rowButton(customer.display_name, customer.id));
      row.append(name, node('td', '', customer.email || '—'),
        node('td', '', customer.phone || '—'),
        node('td', '', new Date(customer.updated_at).toLocaleDateString()));
      return row;
    });
    elements.rows.replaceChildren(...rows);
  }

  function renderQuoteRows(items) {
    setTableHeaders(['Quote', 'Customer', 'Valid until', 'Total', 'Status']);
    if (!items.length) return renderEmptyRow('No quotes match this filter.', 5);
    const rows = items.map((quote) => {
      const row = node('tr');
      const number = node('td');
      number.append(rowButton(`Q-${quote.quote_number}`, quote.id));
      row.append(number, node('td', '', quote.customer?.display_name || 'Customer'),
        node('td', '', quote.valid_until || 'No expiry'),
        node('td', '', formatMoney(quote.total_minor)));
      const status = node('td');
      status.append(statusBadge(quote.status));
      row.append(status);
      return row;
    });
    elements.rows.replaceChildren(...rows);
  }

  function renderBookingRows(items) {
    setTableHeaders(['Customer', 'Service', 'Date & time', 'Package', 'Balance', 'Status']);
    if (!items.length) return renderEmptyRow('No bookings match this filter.', 6);
    const rows = items.map((booking) => {
      const row = node('tr');
      const customer = node('td');
      customer.append(rowButton(booking.customer?.display_name || 'Customer', booking.id));
      row.append(customer,
        node('td', '', booking.service_type),
        node('td', '', `${booking.booking_date}${booking.start_time ? ` · ${booking.start_time.slice(0, 5)}` : ''}`),
        node('td', '', booking.package_name || '—'),
        node('td', '', formatMoney(booking.balance_due_minor)));
      const status = node('td');
      status.append(statusBadge(booking.status));
      row.append(status);
      return row;
    });
    elements.rows.replaceChildren(...rows);
  }

  function makeSection(title) {
    const section = node('section', 'operations-detail-section');
    section.append(node('h3', '', title));
    return section;
  }

  function addRecordRows(container, records, type, titleFor, detailFor) {
    if (!records?.length) {
      container.append(node('p', 'operations-muted', `No ${type} yet.`));
      return;
    }
    const list = node('ul', 'operations-related-list');
    records.forEach((record) => {
      const item = node('li');
      const summary = node('span');
      summary.append(node('strong', '', titleFor(record)), node('small', '', detailFor(record)));
      item.append(summary);
      if (record.id && ['quotes', 'bookings'].includes(type)) {
        const open = actionButton('Open', `open-${type.slice(0, -1)}`);
        open.dataset.recordId = record.id;
        item.append(open);
      }
      if (type === 'inquiries') {
        const actions = node('div', 'operations-related-actions');
        const quoteButton = actionButton('Create quote', 'quote-from-inquiry');
        quoteButton.dataset.inquiryId = record.id;
        const bookingButton = actionButton('Convert to booking', 'booking-from-inquiry');
        bookingButton.dataset.inquiryId = record.id;
        bookingButton.dataset.customerId = record.customer_id || '';
        actions.append(quoteButton, bookingButton);
        item.append(actions);
      }
      list.append(item);
    });
    container.append(list);
  }

  function renderCustomerDetail(customer) {
    const fragment = document.createDocumentFragment();
    fragment.append(node('p', 'page-eyebrow', 'CUSTOMER PROFILE'));
    fragment.append(node('h2', '', customer?.display_name || 'New customer'));
    const form = node('form', 'operations-form');
    const displayName = makeInput('Full name', 'displayName', customer?.display_name || '', { required: true, maxLength: 100 });
    const email = makeInput('Email', 'email', customer?.email || '', { type: 'email', maxLength: 254 });
    const phone = makeInput('Phone', 'phone', customer?.phone || '', { type: 'tel', maxLength: 30 });
    const notes = makeInput('Team notes', 'notes', customer?.notes || '', { multiline: true, rows: 4, maxLength: 5000 });
    form.append(displayName.label, email.label, phone.label, notes.label);
    const save = node('button', 'page-primary-button', customer ? 'Save customer' : 'Create customer');
    save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const result = customer
          ? await request(`/api/admin/customers/${encodeURIComponent(customer.id)}`, {
            method: 'PATCH', body: JSON.stringify(values)
          })
          : await request('/api/admin/customers', {
            method: 'POST', body: JSON.stringify(values)
          });
        state.selectedId = result.data.id;
        await load();
        await showCustomer(result.data.id);
        setStatus('Customer saved.', 'success');
      } catch (error) {
        showFormError(error, form);
      } finally {
        save.disabled = false;
      }
    });
    fragment.append(form);

    if (customer) {
      const inquirySection = makeSection('Inquiry history');
      addRecordRows(inquirySection, customer.inquiries, 'inquiries',
        (inquiry) => `${inquiry.type} · ${inquiry.status}`,
        (inquiry) => `${new Date(inquiry.created_at).toLocaleDateString()} · ${inquiry.message || 'No message'}`);
      fragment.append(inquirySection);
      const quoteSection = makeSection('Quotes');
      addRecordRows(quoteSection, customer.quotes, 'quotes',
        (quote) => `Q-${quote.quote_number} · ${formatMoney(quote.total_minor)}`,
        (quote) => quote.status);
      fragment.append(quoteSection);
      const bookingSection = makeSection('Bookings');
      addRecordRows(bookingSection, customer.bookings, 'bookings',
        (booking) => `${booking.service_type} · ${booking.package_name || 'Booking'}`,
        (booking) => `${booking.booking_date} · Balance ${formatMoney(booking.balance_due_minor)}`);
      fragment.append(bookingSection);
    }
    elements.detail.replaceChildren(fragment);
  }

  async function showCustomer(id) {
    elements.detail.replaceChildren(node('p', 'operations-muted', 'Loading customer profile…'));
    try {
      const result = await request(`/api/admin/customers/${encodeURIComponent(id)}`);
      renderCustomerDetail(result.data);
      state.currentCustomer = result.data;
      state.selectedId = id;
      state.selectedKind = 'customer';
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
    }
  }

  function addQuoteLine(container, values = {}) {
    const row = node('div', 'operations-quote-line');
    const description = makeInput('Description', 'description', values.description || '', { required: true, maxLength: 300 });
    const quantity = makeInput('Qty', 'quantity', values.quantity || 1, { required: true, type: 'number', min: 1, step: 1 });
    const price = makeInput('Unit price (KES)', 'unitPrice', values.unitPriceMinor == null ? '' : (values.unitPriceMinor / 100).toFixed(2), { required: true, type: 'number', min: 0, step: '0.01' });
    const remove = node('button', 'operations-remove-line', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (container.childElementCount > 1) row.remove();
      updateQuoteTotal(container);
    });
    [description, quantity, price].forEach((field) => {
      field.input.addEventListener('input', () => updateQuoteTotal(container));
      row.append(field.label);
    });
    row.append(remove);
    container.append(row);
  }

  function updateQuoteTotal(container) {
    let total = 0;
    for (const row of container.children) {
      const quantity = Number(row.querySelector('[name="quantity"]').value);
      const price = Number(row.querySelector('[name="unitPrice"]').value);
      if (Number.isFinite(quantity) && Number.isFinite(price)) total += Math.round(quantity * price * 100);
    }
    const output = $('#operationsQuoteTotal');
    if (output) output.textContent = formatMoney(total);
  }

  async function openQuoteForm({ quote = null, customerId = '', inquiryId = '' } = {}) {
    elements.detail.replaceChildren(node('p', 'operations-muted', 'Loading quote form…'));
    try {
      const customerResult = await request('/api/admin/customers?limit=50');
      const customers = customerResult.data;
      const fragment = document.createDocumentFragment();
      fragment.append(node('p', 'page-eyebrow', 'QUOTE BUILDER'));
      fragment.append(node('h2', '', quote ? `Q-${quote.quote_number}` : 'New quote'));
      const form = node('form', 'operations-form');
      const customerField = makeSelect('Customer', 'customerId',
        [['', 'Choose a customer'], ...customers.map((customer) => [customer.id, customer.display_name])],
        quote?.customer_id || customerId);
      const inquiryField = makeSelect('Linked inquiry', 'inquiryId', [['', 'No linked inquiry']], quote?.inquiry_id || inquiryId);
      const validUntil = makeInput('Valid until', 'validUntil', quote?.valid_until || '', { type: 'date' });
      const noteField = makeInput('Notes', 'notes', quote?.notes || '', { multiline: true, rows: 3, maxLength: 5000 });
      form.append(customerField.label, inquiryField.label, validUntil.label, noteField.label);
      async function loadInquiryOptions() {
        inquiryField.input.replaceChildren(new Option('No linked inquiry', ''));
        if (!customerField.input.value) return;
        try {
          const customer = (await request(`/api/admin/customers/${encodeURIComponent(customerField.input.value)}`)).data;
          customer.inquiries.forEach((inquiry) => {
            const option = new Option(`${inquiry.type} · ${inquiry.status} · ${new Date(inquiry.created_at).toLocaleDateString()}`, inquiry.id);
            inquiryField.input.append(option);
          });
        } catch (error) {
          showFormError(error, form);
        }
      }
      customerField.input.addEventListener('change', loadInquiryOptions);
      if (customerField.input.value) {
        await loadInquiryOptions();
        inquiryField.input.value = quote?.inquiry_id || inquiryId;
      }
      const itemsSection = makeSection('Line items');
      const itemRows = node('div', 'operations-quote-lines');
      (quote?.items?.length ? quote.items : [{}]).forEach((item) => addQuoteLine(itemRows, {
        ...item,
        unitPriceMinor: item.unit_price_minor ?? item.unitPriceMinor
      }));
      const addLine = node('button', 'website-secondary', 'Add line item');
      addLine.type = 'button';
      addLine.addEventListener('click', () => addQuoteLine(itemRows));
      itemsSection.append(itemRows, addLine);
      const total = node('p', 'operations-total', 'Quote total ');
      total.append(node('strong', '', formatMoney(quote?.total_minor || 0)));
      total.querySelector('strong').id = 'operationsQuoteTotal';
      form.append(itemsSection, total);
      updateQuoteTotal(itemRows);
      const actions = node('div', 'operations-form-actions');
      const cancel = actionButton('Cancel', 'cancel-detail');
      const save = node('button', 'page-primary-button', 'Save draft');
      save.type = 'submit';
      actions.append(cancel, save);
      form.append(actions);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          const lineItems = [...itemRows.children].map((row) => ({
            description: row.querySelector('[name="description"]').value.trim(),
            quantity: Number(row.querySelector('[name="quantity"]').value),
            unitPriceMinor: parseMoney(row.querySelector('[name="unitPrice"]').value)
          }));
          const payload = {
            customerId: customerField.input.value,
            inquiryId: inquiryField.input.value || null,
            validUntil: validUntil.input.value || null,
            notes: noteField.input.value,
            items: lineItems
          };
          const result = await request(quote
            ? `/api/admin/quotes/${encodeURIComponent(quote.id)}`
            : '/api/admin/quotes', {
            method: quote ? 'PUT' : 'POST',
            body: JSON.stringify(payload)
          });
          state.selectedId = result.data.id;
          state.selectedKind = 'quote';
          await load();
          await showQuote(result.data.id);
          setStatus('Quote draft saved.', 'success');
        } catch (error) {
          setStatus(error.message, 'error');
        } finally {
          save.disabled = false;
        }
      });
      elements.detail.replaceChildren(fragment);
      // Move the live form after the customer and line-item fields are complete.
      elements.detail.append(form);
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
    }
  }

  async function showQuote(id) {
    elements.detail.replaceChildren(node('p', 'operations-muted', 'Loading quote…'));
    try {
      const quote = (await request(`/api/admin/quotes/${encodeURIComponent(id)}`)).data;
      const fragment = document.createDocumentFragment();
      fragment.append(node('p', 'page-eyebrow', 'QUOTE'));
      fragment.append(node('h2', '', `Q-${quote.quote_number}`));
      const customer = node('p', 'operations-muted', quote.customer?.display_name || 'Customer');
      fragment.append(customer, statusBadge(quote.status));
      const meta = node('dl', 'operations-meta');
      [['Valid until', quote.valid_until || 'No expiry'], ['Currency', quote.currency]]
        .forEach(([label, value]) => meta.append(node('dt', '', label), node('dd', '', value)));
      fragment.append(meta);
      const list = node('ol', 'operations-quote-items');
      quote.items.forEach((item) => {
        const row = node('li');
        row.append(node('span', '', `${item.description} · ${item.quantity} × ${formatMoney(item.unit_price_minor)}`));
        row.append(node('strong', '', formatMoney(item.line_total_minor)));
        list.append(row);
      });
      fragment.append(list);
      const total = node('p', 'operations-total', `Total ${formatMoney(quote.total_minor)}`);
      fragment.append(total);
      if (quote.notes) fragment.append(node('p', 'operations-note', quote.notes));
      const actions = node('div', 'operations-form-actions');
      actions.append(actionButton('Print quote', 'print-quote'));
      if (quote.status === 'draft') actions.append(actionButton('Edit draft', 'edit-quote'));
      if (quote.status === 'draft' || quote.status === 'sent') {
        actions.append(actionButton(quote.status === 'draft' ? 'Mark sent' : 'Mark accepted', quote.status === 'draft' ? 'quote-sent' : 'quote-accepted'));
      }
      if (quote.status === 'sent') actions.append(actionButton('Mark declined', 'quote-declined'));
      fragment.append(actions);
      const linked = makeSection('Linked customer');
      linked.append(node('p', '', `${quote.customer?.display_name || 'Customer'} · ${quote.customer?.email || 'No email'}`));
      const openCustomer = actionButton('Open customer profile', 'open-customer');
      openCustomer.dataset.recordId = quote.customer_id;
      linked.append(openCustomer);
      fragment.append(linked);
      elements.detail.replaceChildren(fragment);
      state.selectedId = id;
      state.selectedKind = 'quote';
      state.currentQuote = quote;
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
    }
  }

  async function openBookingForm({ booking = null, inquiry = null } = {}) {
    state.conflictReason = '';
    elements.detail.replaceChildren(node('p', 'operations-muted', 'Loading booking form…'));
    try {
      const customerResult = await request('/api/admin/customers?limit=50');
      const customers = customerResult.data;
      const fragment = document.createDocumentFragment();
      fragment.append(node('p', 'page-eyebrow', inquiry ? 'CONVERT INQUIRY TO BOOKING' : 'BOOKING'));
      fragment.append(node('h2', '', booking ? 'Edit booking' : 'New booking'));
      const form = node('form', 'operations-form');
      if (!inquiry && !booking) {
        form.append(makeSelect('Customer', 'customerId',
          [['', 'Choose a customer'], ...customers.map((customer) => [customer.id, customer.display_name])]).label);
        form.append(makeSelect('Service', 'serviceType', [['events', 'Events'], ['desserts', 'Desserts']]).label);
      } else {
        const customer = booking?.customer?.display_name || inquiry?.customer_name || 'Linked customer';
        form.append(node('p', 'operations-linked-customer', `Customer: ${customer}`));
      }
      const bookingDate = makeInput('Date', 'bookingDate', booking?.booking_date || '', { type: 'date', required: true });
      const start = makeInput('Start time', 'startTime', booking?.start_time?.slice(0, 5) || '', {
        type: 'time', hint: 'Use the booking’s local time.'
      });
      const end = makeInput('End time', 'endTime', booking?.end_time?.slice(0, 5) || '', {
        type: 'time', hint: 'Same-day only: choose a time later than the start time.'
      });
      const venue = makeInput('Venue / delivery address', 'venueAddress',
        booking?.venue_address || inquiry?.details?.eventLocation || '', { maxLength: 500 });
      const packageName = makeInput('Package / service', 'packageName',
        booking?.package_name || inquiry?.details?.eventType || inquiry?.details?.dessertType || '', { maxLength: 160 });
      const agreedPrice = makeInput('Agreed price (KES)', 'agreedPrice',
        booking ? (booking.agreed_price_minor / 100).toFixed(2) : '', { type: 'number', min: 0, step: '0.01', required: true });
      const status = makeSelect('Status', 'status', [
        ['scheduled', 'Scheduled'], ['confirmed', 'Confirmed'],
        ['completed', 'Completed'], ['cancelled', 'Cancelled']
      ], booking?.status || 'confirmed');
      const notes = makeInput('Notes', 'notes', booking?.notes || '', { multiline: true, rows: 3, maxLength: 5000 });
      form.append(bookingDate.label, start.label, end.label, venue.label, packageName.label, agreedPrice.label, status.label, notes.label);
      const conflictBox = node('div', 'operations-conflict', '');
      conflictBox.hidden = true;
      const actions = node('div', 'operations-form-actions');
      actions.append(actionButton('Cancel', 'cancel-detail'));
      const save = node('button', 'page-primary-button', booking ? 'Save booking' : 'Create booking');
      save.type = 'submit';
      actions.append(save);
      form.append(conflictBox, actions);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormValidation(form);
        save.disabled = true;
        try {
          if (start.input.value && end.input.value && end.input.value <= start.input.value) {
            showValidationErrors(form, [{
              field: 'endTime',
              message: 'Choose a time later than the start time on the selected date. Overnight bookings are not supported.'
            }]);
            return;
          }
          const payload = {
            bookingDate: bookingDate.input.value,
            startTime: start.input.value || null,
            endTime: end.input.value || null,
            venueAddress: venue.input.value,
            packageName: packageName.input.value,
            agreedPriceMinor: parseMoney(agreedPrice.input.value),
            status: status.input.value,
            notes: notes.input.value
          };
          if (booking) payload.overrideReason = state.conflictReason || undefined;
          let result;
          if (booking) {
            result = await request(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
              method: 'PATCH', body: JSON.stringify(payload)
            });
          } else if (inquiry) {
            payload.overrideReason = state.conflictReason || undefined;
            result = await request(`/api/admin/bookings/from-inquiry/${encodeURIComponent(inquiry.id)}`, {
              method: 'POST', body: JSON.stringify(payload)
            });
          } else {
            payload.customerId = form.elements.customerId.value;
            payload.serviceType = form.elements.serviceType.value;
            payload.overrideReason = state.conflictReason || undefined;
            result = await request('/api/admin/bookings', {
              method: 'POST', body: JSON.stringify(payload)
            });
          }
          state.conflictReason = '';
          state.selectedId = result.data.id;
          state.selectedKind = 'booking';
          await load();
          await showBooking(result.data.id);
          setStatus(booking ? 'Booking updated.' : 'Booking created.', 'success');
        } catch (error) {
          if (error.code === 'booking_conflict') {
            conflictBox.replaceChildren(
              node('strong', '', 'A conflict needs an explicit override.'),
              node('p', '', 'Review the schedule, enter a reason, then submit again to record the audited override.')
            );
            if (error.conflicts?.eventConflicts?.length) {
              error.conflicts.eventConflicts.forEach((item) =>
                conflictBox.append(node('p', '', `${item.packageName || 'Event'} · ${item.startTime || 'all day'}`))
              );
            }
            if (error.conflicts?.capacityExceeded) {
              conflictBox.append(node('p', '', `Dessert capacity reached (${error.conflicts.dessertBookings}/${error.conflicts.dessertCapacity}).`));
            }
            const reason = makeInput('Override reason', 'overrideReason', state.conflictReason, {
              required: true, maxLength: 500, placeholder: 'Explain why this booking should proceed.'
            });
            reason.input.addEventListener('input', () => { state.conflictReason = reason.input.value; });
            conflictBox.append(reason.label);
            conflictBox.hidden = false;
            setStatus(error.message, 'error');
          } else {
            showFormError(error, form);
          }
        } finally {
          save.disabled = false;
        }
      });
      elements.detail.replaceChildren(fragment);
      elements.detail.append(form);
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
    }
  }

  async function showBooking(id) {
    elements.detail.replaceChildren(node('p', 'operations-muted', 'Loading booking…'));
    try {
      const booking = (await request(`/api/admin/bookings/${encodeURIComponent(id)}`)).data;
      const fragment = document.createDocumentFragment();
      fragment.append(node('p', 'page-eyebrow', `${booking.service_type.toUpperCase()} BOOKING`));
      fragment.append(node('h2', '', booking.package_name || 'Booking'));
      fragment.append(node('p', 'operations-muted', `${booking.customer?.display_name || 'Customer'} · ${booking.booking_date}${booking.start_time ? ` · ${booking.start_time.slice(0, 5)}` : ''}`));
      fragment.append(statusBadge(booking.status));
      const details = node('dl', 'operations-meta');
      [
        ['Venue / address', booking.venue_address || 'Not specified'],
        ['Agreed price', formatMoney(booking.agreed_price_minor)],
        ['Paid', formatMoney(booking.paid_total_minor)],
        ['Balance due', formatMoney(booking.balance_due_minor)]
      ].forEach(([label, value]) => details.append(node('dt', '', label), node('dd', '', value)));
      fragment.append(details);
      if (booking.notes) fragment.append(node('p', 'operations-note', booking.notes));
      const edit = actionButton('Edit booking', 'edit-booking');
      fragment.append(edit);
      const paymentSection = makeSection('Record payment');
      const paymentForm = node('form', 'operations-form');
      const paymentType = makeSelect('Payment type', 'paymentType', [
        ['deposit', 'Deposit'], ['balance', 'Balance'], ['other', 'Other']
      ]);
      const amount = makeInput('Amount (KES)', 'amount', '', { type: 'number', min: 0.01, step: '0.01', required: true });
      const method = makeSelect('Method', 'method', [
        ['cash', 'Cash'], ['mobile_money', 'Mobile money'], ['bank_transfer', 'Bank transfer'],
        ['card', 'Card'], ['other', 'Other']
      ]);
      const reference = makeInput('Reference', 'reference', '', { maxLength: 160 });
      paymentForm.append(paymentType.label, amount.label, method.label, reference.label);
      const recordPayment = node('button', 'page-primary-button', 'Record payment');
      recordPayment.type = 'submit';
      recordPayment.disabled = booking.status === 'cancelled' || booking.balance_due_minor <= 0;
      paymentForm.append(recordPayment);
      paymentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        recordPayment.disabled = true;
        try {
          await request(`/api/admin/bookings/${encodeURIComponent(id)}/payments`, {
            method: 'POST',
            body: JSON.stringify({
              paymentType: paymentType.input.value,
              amountMinor: parseMoney(amount.input.value),
              method: method.input.value,
              reference: reference.input.value
            })
          });
          await showBooking(id);
          await load();
          setStatus('Payment recorded and balance recalculated.', 'success');
        } catch (error) {
          showFormError(error, paymentForm);
        } finally {
          recordPayment.disabled = false;
        }
      });
      paymentSection.append(paymentForm);
      if (booking.payments?.length) {
        const paymentList = node('ul', 'operations-related-list');
        booking.payments.forEach((payment) => {
          const item = node('li');
          item.append(node('span', '', `${payment.payment_type} · ${payment.method} · ${new Date(payment.received_at).toLocaleDateString()}`));
          item.append(node('strong', '', formatMoney(payment.amount_minor)));
          paymentList.append(item);
        });
        paymentSection.append(paymentList);
      }
      fragment.append(paymentSection);
      const customerLink = actionButton('Open customer profile', 'open-customer');
      customerLink.dataset.recordId = booking.customer_id;
      fragment.append(customerLink);
      elements.detail.replaceChildren(fragment);
      state.selectedId = id;
      state.selectedKind = 'booking';
      state.currentBooking = booking;
    } catch (error) {
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
    }
  }

  function startOfWeek(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() - result.getDay());
    return result;
  }

  function calendarRange() {
    if (state.calendarMode === 'day') {
      const value = dateValue(state.date);
      return { from: value, to: value };
    }
    if (state.calendarMode === 'week') {
      const start = startOfWeek(state.date);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: dateValue(start), to: dateValue(end) };
    }
    const from = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    const to = new Date(state.date.getFullYear(), state.date.getMonth() + 1, 0);
    return { from: dateValue(from), to: dateValue(to) };
  }

  function renderCalendar(bookings) {
    const { from, to } = calendarRange();
    const container = document.createDocumentFragment();
    const heading = node('div', 'operations-calendar-heading');
    heading.append(node('h2', '', state.calendarMode === 'month'
      ? state.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `${from} — ${to}`));
    container.append(heading);
    const byDate = new Map();
    bookings.forEach((booking) => {
      const entries = byDate.get(booking.booking_date) || [];
      entries.push(booking);
      byDate.set(booking.booking_date, entries);
    });
    const grid = node('div', `operations-calendar-grid mode-${state.calendarMode}`);
    if (state.calendarMode !== 'day') {
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        .forEach((day) => grid.append(node('div', 'operations-calendar-weekday', day)));
    }
    let days = [];
    if (state.calendarMode === 'month') {
      const first = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
      const start = new Date(first);
      start.setDate(1 - first.getDay());
      days = Array.from({ length: 42 }, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        return day;
      });
    } else if (state.calendarMode === 'week') {
      const start = startOfWeek(state.date);
      days = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        return day;
      });
    } else {
      days = [new Date(state.date.getFullYear(), state.date.getMonth(), state.date.getDate())];
    }
    days.forEach((day) => {
      const key = dateValue(day);
      const cell = node('div', 'operations-calendar-day');
      if (state.calendarMode === 'month' && day.getMonth() !== state.date.getMonth()) cell.classList.add('is-outside-month');
      if (key === dateValue(new Date())) cell.classList.add('is-today');
      const dayButton = node('button', 'operations-calendar-date', String(day.getDate()));
      dayButton.type = 'button';
      dayButton.addEventListener('click', () => {
        state.date = day;
        state.calendarMode = 'day';
        buildToolbar();
        loadCalendar();
      });
      cell.append(dayButton);
      (byDate.get(key) || []).forEach((booking) => {
        const event = node('button', `operations-calendar-event service-${booking.service_type}`, `${booking.start_time ? `${booking.start_time.slice(0, 5)} · ` : ''}${booking.customer?.display_name || booking.package_name || booking.service_type}`);
        event.type = 'button';
        event.title = `${booking.service_type}: ${booking.package_name || 'Booking'} · ${booking.status}`;
        event.addEventListener('click', () => {
          state.navigateRecord = { id: booking.id, kind: 'booking' };
          navTo('Bookings');
        });
        cell.append(event);
      });
      grid.append(cell);
    });
    container.append(grid);
    const legend = node('p', 'operations-calendar-legend', 'Events · Desserts');
    legend.insertBefore(node('span', 'operations-legend-dot service-events'), legend.firstChild);
    legend.insertBefore(node('span', 'operations-legend-dot service-desserts'), legend.childNodes[2] || null);
    container.append(legend);
    elements.calendar.replaceChildren(container);
  }

  async function loadCalendar() {
    const range = calendarRange();
    try {
      const result = await request(`/api/admin/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=50`);
      renderCalendar(result.data);
      setStatus(`${result.meta.total} booking${result.meta.total === 1 ? '' : 's'} in this period.`);
      await loadCapacity();
    } catch (error) {
      elements.calendar.replaceChildren(node('p', 'operations-error', error.message));
      setStatus(error.message, 'error');
    }
  }

  async function loadCapacity() {
    const existing = $('#dessertCapacityPanel');
    if (existing) existing.remove();
    try {
      const result = await request('/api/admin/operations/settings/dessert-capacity');
      state.capacity = result.data.limit;
      const panel = node('section', 'operations-capacity-panel');
      panel.id = 'dessertCapacityPanel';
      panel.append(node('h3', '', 'Dessert daily capacity'));
      panel.append(node('p', 'operations-muted', 'Leave blank for unlimited. Bookings beyond the limit require an audited override.'));
      const form = node('form', 'operations-capacity-form');
      const field = makeInput('Maximum bookings per day', 'limit', state.capacity ?? '', { type: 'number', min: 1, maxLength: 4 });
      form.append(field.label);
      const save = node('button', 'website-secondary', 'Save capacity');
      save.type = 'submit';
      form.append(save);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          const raw = field.input.value.trim();
          await window.rafaAdminStepUp.run(() =>
            request('/api/admin/operations/settings/dessert-capacity', {
              method: 'PUT',
              body: JSON.stringify({ limit: raw ? Number(raw) : null })
            })
          );
          state.capacity = raw ? Number(raw) : null;
          setStatus('Dessert capacity setting saved.', 'success');
          await loadCalendar();
        } catch (error) {
          showFormError(error, form);
        } finally {
          save.disabled = false;
        }
      });
      panel.append(form);
      elements.calendar.append(panel);
    } catch (error) {
      if (error.status !== 403) setStatus(error.message, 'error');
    }
  }

  async function load() {
    buildToolbar();
    setStatus('Loading records…');
    if (state.view === 'Calendar') return loadCalendar();
    const query = new URLSearchParams({
      page: String(state.page),
      limit: '25'
    });
    if (state.search) query.set('q', state.search);
    if (state.status) query.set('status', state.status);
    const endpoint = {
      Customers: '/api/admin/customers',
      Quotes: '/api/admin/quotes',
      Bookings: '/api/admin/bookings'
    }[state.view];
    try {
      const result = await request(`${endpoint}?${query}`);
      state.total = result.meta.total;
      if (state.view === 'Customers') renderCustomerRows(result.data);
      else if (state.view === 'Quotes') renderQuoteRows(result.data);
      else renderBookingRows(result.data);
      updatePagination();
      setStatus('');
      if (state.pendingQuote) {
        const pending = state.pendingQuote;
        state.pendingQuote = null;
        await openQuoteForm(pending);
      } else if (state.pendingBooking) {
        const pending = state.pendingBooking;
        state.pendingBooking = null;
        await openBookingForm(pending);
      } else if (state.selectedId && state.selectedKind === 'customer' && state.view === 'Customers') {
        await showCustomer(state.selectedId);
      } else if (state.selectedId && state.selectedKind === 'quote' && state.view === 'Quotes') {
        await showQuote(state.selectedId);
      } else if (state.selectedId && state.selectedKind === 'booking' && state.view === 'Bookings') {
        await showBooking(state.selectedId);
      } else {
        elements.detail.replaceChildren(node('div', 'operations-empty', 'Select a record to review its details.'));
      }
    } catch (error) {
      renderEmptyRow(error.message, state.view === 'Customers' ? 4 : state.view === 'Quotes' ? 5 : 6);
      elements.detail.replaceChildren(node('p', 'operations-error', error.message));
      setStatus(error.message, 'error');
    }
  }

  async function loadSummary() {
    try {
      const result = await request('/api/admin/operations/summary');
      const summary = result.data;
      $('#summaryNewInquiries').textContent = summary.newInquiries ?? '—';
      $('#summaryQuotesAwaiting').textContent = summary.quotesAwaitingReply ?? '—';
      $('#summaryUpcomingBookings').textContent = summary.upcomingBookings ?? '—';
      $('#summaryBalancesDue').textContent = summary.balancesDueMinor == null
        ? '—' : formatMoney(summary.balancesDueMinor);
      elements.summaryStatus.textContent = '';
    } catch (error) {
      elements.summaryStatus.textContent = error.message;
      elements.summaryStatus.dataset.state = 'error';
    }
  }

  function rangeStep(direction) {
    const date = new Date(state.date);
    if (state.calendarMode === 'month') date.setMonth(date.getMonth() + direction);
    else if (state.calendarMode === 'week') date.setDate(date.getDate() + direction * 7);
    else date.setDate(date.getDate() + direction);
    state.date = date;
    buildToolbar();
    loadCalendar();
  }

  document.querySelectorAll('[data-operations-view]').forEach((tab) => {
    tab.addEventListener('click', () => navTo(tab.dataset.operationsView));
  });
  document.querySelectorAll('[data-nav-target]').forEach((button) => {
    button.addEventListener('click', () => navTo(button.dataset.navTarget));
  });
  document.querySelector('[data-nav="CRM"]')?.addEventListener('click', () => navTo('Customers'));
  elements.refresh.addEventListener('click', () => {
    if (state.view === 'Calendar') loadCalendar();
    else load();
  });
  elements.create.addEventListener('click', () => {
    if (state.view === 'Customers') {
      state.selectedId = null;
      state.selectedKind = 'customer';
      renderCustomerDetail(null);
    } else if (state.view === 'Quotes') {
      openQuoteForm();
    } else if (state.view === 'Bookings') {
      openBookingForm();
    }
  });
  elements.search.addEventListener('input', () => {
    state.search = elements.search.value.trim();
    state.page = 1;
    clearTimeout(state.debounce);
    state.debounce = setTimeout(load, 250);
  });
  elements.status.addEventListener('change', () => {
    state.status = elements.status.value;
    state.page = 1;
    load();
  });
  elements.previous.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      load();
    }
  });
  elements.next.addEventListener('click', () => {
    if (state.page * 25 < state.total) {
      state.page += 1;
      load();
    }
  });
  elements.calendarMode.addEventListener('change', () => {
    state.calendarMode = elements.calendarMode.value;
    buildToolbar();
    loadCalendar();
  });
  elements.calendarDate.addEventListener('change', () => {
    if (!elements.calendarDate.value) return;
    state.date = new Date(`${elements.calendarDate.value}T12:00:00`);
    loadCalendar();
  });
  $('#operationsCalendarPrevious').addEventListener('click', () => rangeStep(-1));
  $('#operationsCalendarNext').addEventListener('click', () => rangeStep(1));
  elements.rows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-record-id]');
    if (!button) return;
    const id = button.dataset.recordId;
    if (state.view === 'Customers') showCustomer(id);
    else if (state.view === 'Quotes') showQuote(id);
    else showBooking(id);
  });
  elements.detail.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-operation-action]');
    if (!button) return;
    const action = button.dataset.operationAction;
    if (action === 'cancel-detail') {
      elements.detail.replaceChildren(node('div', 'operations-empty', 'Select a record to review its details.'));
    } else if (action === 'quote-from-inquiry') {
      state.pendingQuote = {
        customerId: state.selectedId,
        inquiryId: button.dataset.inquiryId
      };
      navTo('Quotes');
    } else if (action === 'booking-from-inquiry') {
      state.pendingBooking = { inquiry: {
        id: button.dataset.inquiryId,
        customer_id: button.dataset.customerId
      } };
      const inquiryRecord = state.currentCustomer?.inquiries?.find((item) => item.id === button.dataset.inquiryId);
      if (inquiryRecord) state.pendingBooking.inquiry = { ...inquiryRecord, id: button.dataset.inquiryId };
      state.pendingBooking.inquiry.customer_name = state.currentCustomer?.display_name;
      navTo('Bookings');
    } else if (action === 'open-quote') {
      state.navigateRecord = { id: button.dataset.recordId, kind: 'quote' };
      navTo('Quotes');
    } else if (action === 'open-booking') {
      state.navigateRecord = { id: button.dataset.recordId, kind: 'booking' };
      navTo('Bookings');
    } else if (action === 'open-customer') {
      state.navigateRecord = { id: button.dataset.recordId, kind: 'customer' };
      navTo('Customers');
    } else if (action === 'edit-quote') {
      openQuoteForm({ quote: state.currentQuote });
    } else if (action === 'edit-booking') {
      openBookingForm({ booking: state.currentBooking });
    } else if (action === 'quote-sent' || action === 'quote-accepted' || action === 'quote-declined') {
      const status = action === 'quote-sent' ? 'sent'
        : action === 'quote-accepted' ? 'accepted' : 'declined';
      button.disabled = true;
      try {
        await request(`/api/admin/quotes/${encodeURIComponent(state.selectedId)}/status`, {
          method: 'PATCH', body: JSON.stringify({ status })
        });
        await showQuote(state.selectedId);
        await load();
        setStatus(`Quote marked ${status}.`, 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    } else if (action === 'print-quote') {
      document.body.classList.add('operations-printing');
      window.print();
      window.setTimeout(() => document.body.classList.remove('operations-printing'), 500);
    }
  });
  window.addEventListener('rafa-operations-opened', (event) => {
    const navigationTarget = state.navigateRecord;
    state.navigateRecord = null;
    state.view = viewCopy[event.detail?.view] ? event.detail.view : 'Customers';
    state.page = 1;
    state.search = event.detail?.search || '';
    state.status = '';
    state.selectedId = navigationTarget?.id || null;
    state.selectedKind = navigationTarget?.kind || '';
    buildToolbar();
    load();
  });
  window.addEventListener('rafa-operations-search', (event) => {
    state.search = event.detail?.q || '';
    elements.search.value = state.search;
    state.page = 1;
    load();
  });
  window.addEventListener('rafa-admin-dashboard-opened', loadSummary);
  window.addEventListener('rafa-admin-authenticated', loadSummary);
})();
