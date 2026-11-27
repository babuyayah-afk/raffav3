(() => {
  const $ = (selector) => document.querySelector(selector);
  const configuredBase = $('meta[name="rafa-api-base"]')?.content.trim();
  const hostname = window.location.hostname;
  const apiBase = (configuredBase || (
    ['localhost', '127.0.0.1'].includes(hostname)
      ? `${window.location.protocol}//${hostname}:3001`
      : ''
  )).replace(/\/$/, '');
  const defaults = {
    'home.heroCards': {
      floatingOne: {
        label: 'Published Nairobi package examples',
        value: 'KSh 50k–120k',
        unit: 'private setups · 20–100 guests',
        bars: []
      },
      floatingTwo: {
        title: 'Indicative market references',
        items: [
          { text: 'Private setup · 20 guests', time: 'KSh 50k' },
          { text: 'Private setup · 50 guests', time: 'KSh 85k' },
          { text: 'Private setup · 100 guests', time: 'KSh 120k' },
          { text: 'Wedding package · 200–300 guests', time: 'KSh 299k–799k' }
        ]
      }
    },
    'home.stats': [],
    'home.services': [
      { title: 'Weddings', description: 'Full planning, décor & day-of coordination', image: '' },
      { title: 'Corporate', description: 'Launches, summits, galas', image: '' },
      { title: 'Concerts', description: 'Stage, sound, light', image: '' },
      { title: 'Private parties', description: 'Birthdays, anniversaries, rooftop dinners', image: '' }
    ],
    'home.projects': [],
    'apparel.catalog': [
      { id: 'celine-wrap-blazer', name: 'Celine Wrap Blazer', category: 'clothes', description: 'Structured drape in a soft neutral tone for everyday polish.', price: 24559, rating: 4.9, image: '' },
      { id: 'luna-knit-set', name: 'Luna Knit Set', category: 'clothes', description: 'A cozy matching co-ord with a relaxed silhouette and refined finish.', price: 18971, rating: 4.8, image: '' },
      { id: 'aster-leather-sneaker', name: 'Aster Leather Sneaker', category: 'shoes', description: 'Low-profile everyday leather sneakers with cushioned soles.', price: 17152, rating: 4.7, image: '' },
      { id: 'sloane-slingback', name: 'Sloane Slingback', category: 'shoes', description: 'A classic heel with sculpted ease and a refined pointed toe.', price: 22090, rating: 4.9, image: '' },
      { id: 'mila-structured-tote', name: 'Mila Structured Tote', category: 'handbags', description: 'A clean carry-all designed for work, travel and city errands.', price: 27807, rating: 4.8, image: '' },
      { id: 'sera-mini-shoulder', name: 'Sera Mini Shoulder', category: 'handbags', description: 'Compact shape, polished hardware and everyday utility.', price: 21830, rating: 4.7, image: '' },
      { id: 'noor-gold-hoop', name: 'Noor Gold Hoop', category: 'accessories', description: 'A lightweight statement finish for easy day-to-night styling.', price: 5717, rating: 4.9, image: '' },
      { id: 'vale-silk-scarf', name: 'Vale Silk Scarf', category: 'accessories', description: 'Add movement, color and polish with a soft silk finish.', price: 6757, rating: 4.8, image: '' },
      { id: 'ari-cotton-shirt', name: 'Ari Cotton Shirt', category: 'clothes', description: 'Soft structure and an oversized fit for effortless layering.', price: 12474, rating: 4.8, image: '' },
      { id: 'nora-trench-coat', name: 'Nora Trench Coat', category: 'clothes', description: 'Minimal outerwear with a clean drape and weather-ready finish.', price: 29626, rating: 5, image: '' },
      { id: 'harlow-slide', name: 'Harlow Slide', category: 'shoes', description: 'A quiet statement sandal for warm weather and easy movement.', price: 14813, rating: 4.7, image: '' },
      { id: 'rhea-chain-bag', name: 'Rhea Chain Bag', category: 'handbags', description: 'Glossy polish and a streamlined silhouette in a functional shape.', price: 23129, rating: 4.8, image: '' }
    ],
    'apparel.newsletter': {
      eyebrow: 'Notes from the RAFA edit',
      title: 'Stay in the loop',
      description: 'Preview a signup for new arrivals and style inspiration.',
      button: 'Sign up'
    }
  };
  const descriptions = {
    'home.heroCards': 'Edit the two floating cards shown over the homepage hero image.',
    'home.stats': 'Update the four homepage counters.',
    'home.services': 'Edit the homepage service tiles and their optional image URLs.',
    'home.projects': 'Edit portfolio cards, highlights, and optional image URLs.',
    'apparel.catalog': 'Edit product details and optional image URLs in the apparel catalogue.',
    'apparel.newsletter': 'Edit the newsletter callout text and button label.'
  };
  const schemas = {
    'home.heroCards': [
      {
        title: 'Floating stats card',
        fields: [
          { path: ['floatingOne', 'label'], label: 'Label' },
          { path: ['floatingOne', 'value'], label: 'Value' },
          { path: ['floatingOne', 'unit'], label: 'Unit' },
          { path: ['floatingOne', 'bars'], label: 'Bar heights (one percentage per line)', type: 'lines' }
        ]
      },
      {
        title: 'Activity card',
        fields: [{ path: ['floatingTwo', 'title'], label: 'Title' }]
      },
      {
        title: 'Activity items',
        arrayPath: ['floatingTwo', 'items'],
        maxItems: 20,
        itemTemplate: { text: '', time: '', progress: 'false' },
        fields: [
          { key: 'text', label: 'Activity text' },
          { key: 'time', label: 'Time' },
          { key: 'progress', label: 'Show as in progress', type: 'select', options: [['false', 'Complete'], ['true', 'In progress']] }
        ]
      }
    ],
    'home.stats': [{
      title: 'Counter items',
      arrayPath: [],
      maxItems: 4,
      itemTemplate: { value: 0, label: '' },
      fields: [
        { key: 'value', label: 'Value', type: 'number', step: '1' },
        { key: 'label', label: 'Label' }
      ]
    }],
    'home.services': [{
      title: 'Service tiles',
      arrayPath: [],
      maxItems: 4,
      itemTemplate: { title: '', description: '', image: '' },
      fields: [
        { key: 'title', label: 'Title' },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'image', label: 'Image URL (optional)', type: 'url', placeholder: 'https://example.com/image.jpg' }
      ]
    }],
    'home.projects': [{
      title: 'Portfolio items',
      arrayPath: [],
      maxItems: 4,
      itemTemplate: { initials: '', title: '', subtitle: '', image: '', highlights: [] },
      fields: [
        { key: 'initials', label: 'Display initials' },
        { key: 'title', label: 'Title' },
        { key: 'subtitle', label: 'Subtitle' },
        { key: 'image', label: 'Image URL (optional)', type: 'url', placeholder: 'https://example.com/image.jpg' },
        { key: 'highlights', label: 'Highlights (one per line)', type: 'lines' }
      ]
    }],
    'apparel.catalog': [{
      title: 'Products',
      arrayPath: [],
      maxItems: 100,
      itemTemplate: { id: '', name: '', category: 'clothes', description: '', price: 0, rating: 0, image: '' },
      fields: [
        { key: 'id', label: 'Product ID' },
        { key: 'name', label: 'Product name' },
        { key: 'category', label: 'Category', type: 'select', options: [['clothes', 'Clothes'], ['shoes', 'Shoes'], ['handbags', 'Handbags'], ['accessories', 'Accessories']] },
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'price', label: 'Price (KES)', type: 'number', step: '1' },
        { key: 'rating', label: 'Rating', type: 'number', step: '0.1' },
        { key: 'image', label: 'Image URL (optional)', type: 'url', placeholder: 'https://example.com/image.jpg' }
      ]
    }],
    'apparel.newsletter': [{
      title: 'Newsletter callout',
      fields: [
        { path: ['eyebrow'], label: 'Eyebrow' },
        { path: ['title'], label: 'Title' },
        { path: ['description'], label: 'Description', type: 'textarea' },
        { path: ['button'], label: 'Button label' }
      ]
    }]
  };
  const currentContent = JSON.parse(JSON.stringify(defaults));
  const savedContent = JSON.parse(JSON.stringify(defaults));
  const dirtyKeys = new Set();
  const savedKeys = new Set();
  const draftKeys = new Set();
  let canManageContent = false;
  let isSaving = false;
  const maxItemsByKey = {
    'home.stats': 4,
    'home.services': 4,
    'home.projects': 4,
    'apparel.catalog': 100
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function setStatus(message, state = '') {
    const status = $('#websiteContentStatus');
    status.textContent = message;
    status.dataset.state = state;
  }

  function updateSaveButton() {
    const key = $('#websiteContentKey').value;
    const disabled = !canManageContent || isSaving || !dirtyKeys.has(key);
    $('#websiteSaveDraft').disabled = disabled;
    $('#websiteSaveContent').disabled = disabled;
  }

  function getPreviewState(key) {
    if (dirtyKeys.has(key)) return 'Unsaved edits';
    if (draftKeys.has(key)) return 'Draft preview';
    return savedKeys.has(key) ? 'Saved version' : 'Sample preview';
  }

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
      const error = new Error(result?.message || result?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function loadSavedContent() {
    try {
      const result = await request('/api/admin/site-content');
      Object.keys(defaults).forEach((key) => {
        if (Object.hasOwn(result.content, key)) {
          savedKeys.add(key);
        } else {
          savedKeys.delete(key);
        }
        const hasDraft = Object.hasOwn(result.drafts || {}, key);
        if (hasDraft) draftKeys.add(key);
        else draftKeys.delete(key);
        const loaded = hasDraft ? result.drafts[key]
          : Object.hasOwn(result.content, key) ? result.content[key] : defaults[key];
        savedContent[key] = JSON.parse(JSON.stringify(loaded));
        if (!dirtyKeys.has(key)) currentContent[key] = JSON.parse(JSON.stringify(loaded));
      });
      const key = $('#websiteContentKey').value;
      renderEditor(key);
      renderPreview(key);
      $('#websitePreviewState').textContent = getPreviewState(key);
      setStatus('Saved website content loaded.', 'success');
    } catch (error) {
      console.error('Unable to load saved website content:', error);
      setStatus(`${error.message} Sign in with an admin account and retry.`, 'error');
    }
    updateSaveButton();
  }

  async function saveSelectedContent(status) {
    const key = $('#websiteContentKey').value;
    if (!dirtyKeys.has(key) || !canManageContent || isSaving) return;
    isSaving = true;
    updateSaveButton();
    setStatus(status === 'draft' ? 'Saving draft...' : 'Publishing content...');
    try {
      const result = await request(`/api/admin/site-content/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value: currentContent[key], status })
      });
      savedContent[key] = JSON.parse(JSON.stringify(result.value));
      currentContent[key] = JSON.parse(JSON.stringify(result.value));
      dirtyKeys.delete(key);
      if (status === 'draft') draftKeys.add(key);
      else {
        draftKeys.delete(key);
        savedKeys.add(key);
      }
      renderEditor(key);
      renderPreview(key);
      $('#websitePreviewState').textContent = status === 'draft' ? 'Draft preview' : 'Published';
      setStatus(status === 'draft'
        ? 'Draft saved. The live website is unchanged.'
        : 'Content published to the website.', 'success');
    } catch (error) {
      console.error('Unable to save website content:', error);
      setStatus(`${error.message} Content was not saved.`, 'error');
    } finally {
      isSaving = false;
      updateSaveButton();
    }
  }

  function setView(name) {
    const contentView = $('#websiteContentView');
    contentView.classList.toggle(
      'website-content-view--admin-style',
      name === 'Website Content' || name === 'CMS'
    );
    if (name === 'Website Content' || name === 'CMS' || name === 'Apparels') {
      $('#dashboardView').hidden = true;
      $('#adminPageView').hidden = true;
      contentView.hidden = false;
      $('#showcaseAdminTabs').hidden = name !== 'CMS';
      $('#websiteContentPanel').hidden = name === 'CMS';
      $('#testimonialReviewPanel').hidden = name !== 'CMS';
      const group = name === 'Apparels' ? 'apparel' : 'general';
      const contentKey = $('#websiteContentKey');
      const groups = Array.from(contentKey.querySelectorAll('optgroup'));
      groups.forEach((optionGroup) => {
        optionGroup.hidden = optionGroup.dataset.contentGroup !== group;
      });
      const selectedGroup = contentKey.selectedOptions[0]?.parentElement;
      if (selectedGroup?.dataset.contentGroup !== group) {
        contentKey.value = groups.find((optionGroup) => optionGroup.dataset.contentGroup === group)
          .querySelector('option').value;
      }
      $('#websiteContentTitle').textContent = name;
      $('#websiteContentDescription').textContent = name === 'Apparels'
        ? 'Edit the apparel catalog and newsletter copy. Save changes to publish them.'
        : name === 'CMS'
          ? 'Manage packages, portfolio, FAQs, homepage sections, media, and testimonials.'
          : 'Edit homepage page text and publish changes to the website.';
      $('#globalSearch').placeholder = `Search ${name.toLowerCase()}...`;
      if (name !== 'CMS') loadSelectedEditor();
      window.dispatchEvent(new CustomEvent('rafa-admin-view-changed', { detail: name }));
    } else {
      contentView.hidden = true;
    }
  }

  function getPathValue(object, path) {
    return path.reduce((value, key) => value == null ? undefined : value[key], object);
  }

  function setPathValue(object, path, value) {
    const parent = getPathValue(object, path.slice(0, -1));
    parent[path[path.length - 1]] = value;
  }

  function makeField(field, value, onChange) {
    const wide = ['textarea', 'lines', 'url'].includes(field.type);
    const wrapper = node('div', wide ? 'website-field website-field--wide' : 'website-field');
    const label = node('label', '', field.label);
    const control = field.type === 'textarea' || field.type === 'lines'
      ? node('textarea', 'website-field-control')
      : field.type === 'select'
        ? node('select', 'website-field-control')
        : node('input', 'website-field-control');

    if (field.type === 'select') {
      field.options.forEach(([optionValue, optionLabel]) => {
        const option = node('option', '', optionLabel);
        option.value = optionValue;
        control.append(option);
      });
    } else if (control instanceof HTMLInputElement) {
      control.type = field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text';
      if (field.step) control.step = field.step;
      if (field.type === 'url') control.autocomplete = 'url';
    }

    control.value = field.type === 'lines' && Array.isArray(value)
      ? value.join('\n')
      : value == null ? '' : String(value);
    control.id = `website-field-${Math.random().toString(36).slice(2)}`;
    label.htmlFor = control.id;
    if (field.placeholder) control.placeholder = field.placeholder;
    control.addEventListener('input', () => {
      let nextValue = control.value;
      if (field.type === 'number') nextValue = nextValue === '' ? 0 : Number(nextValue);
      if (field.type === 'lines') {
        nextValue = nextValue.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      }
      onChange(nextValue);
    });
    wrapper.append(label, control);
    if (field.type === 'url') {
      wrapper.append(node('small', 'website-field-help', 'Use an HTTP or HTTPS image URL. Leave blank to keep the image placeholder.'));
    }
    return wrapper;
  }

  function renderEditor(key) {
    const container = $('#websiteContentFields');
    container.replaceChildren();
    container.classList.toggle('website-content-fields--single', schemas[key].length === 1);
    schemas[key].forEach((section) => {
      const card = node('section', section.arrayPath
        ? 'website-field-section website-field-section--collection'
        : 'website-field-section');
      card.append(node('h3', '', section.title));
      if (section.fields && !section.arrayPath) {
        const fields = node('div', 'website-field-controls');
        section.fields.forEach((field) => {
          const value = getPathValue(currentContent[key], field.path);
          fields.append(makeField(field, value, (nextValue) => {
            setPathValue(currentContent[key], field.path, nextValue);
            contentChanged(key);
          }));
        });
        card.append(fields);
      }
      if (section.arrayPath) renderArrayEditor(card, key, section);
      container.append(card);
    });
  }

  function renderArrayEditor(container, key, section) {
    const items = getPathValue(currentContent[key], section.arrayPath);
    const grid = node('div', 'website-array-grid');
    items.forEach((item, index) => {
      const row = node('article', 'website-array-item');
      const heading = node('div', 'website-array-item-heading');
      heading.append(node('h4', '', `${section.title.replace(/ items$|s$/, '')} ${index + 1}`));
      const remove = node('button', 'website-remove-item', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove item ${index + 1}`);
      remove.addEventListener('click', () => {
        items.splice(index, 1);
        renderEditor(key);
        contentChanged(key);
      });
      heading.append(remove);
      const fields = node('div', 'website-array-item-fields');
      section.fields.forEach((field) => {
        fields.append(makeField(field, item[field.key], (nextValue) => {
          item[field.key] = nextValue;
          contentChanged(key);
        }));
      });
      row.append(heading, fields);
      grid.append(row);
    });

    const add = node('button', 'website-add-item', 'Add item');
    add.type = 'button';
    add.disabled = items.length >= section.maxItems;
    add.addEventListener('click', () => {
      items.push(JSON.parse(JSON.stringify(section.itemTemplate)));
      renderEditor(key);
      contentChanged(key);
    });
    container.append(grid, add);
  }

  function contentChanged(key) {
    dirtyKeys.add(key);
    renderPreview(key);
    $('#websitePreviewState').textContent = 'Unsaved edits';
    setStatus(canManageContent
      ? 'Preview updated. Save and publish to make this change live.'
      : 'Preview updated. Sign in with an owner or manager account to save changes.');
    updateSaveButton();
  }

  function safeImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value.trim(), window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function imagePreview(value, alt) {
    const wrapper = node('div', 'website-preview-image');
    const source = safeImageUrl(value);
    if (source) {
      const image = node('img');
      image.src = source;
      image.alt = alt || '';
      image.loading = 'lazy';
      image.decoding = 'async';
      wrapper.append(image);
    } else {
      wrapper.append(node('span', '', 'Image placeholder'));
    }
    return wrapper;
  }

  function renderPreview(key) {
    const preview = $('#websiteContentPreview');
    preview.replaceChildren();
    preview.dataset.section = key;
    const content = currentContent[key];

    if (key === 'home.heroCards') {
      const grid = node('div', 'website-preview-hero');
      const summary = node('article', 'website-preview-card website-preview-summary');
      const first = content.floatingOne;
      summary.append(node('small', '', first.label), node('strong', '', first.value), node('span', '', first.unit));
      const bars = node('div', 'website-preview-bars');
      first.bars.forEach((height) => {
        const bar = node('i');
        bar.style.height = `${Math.max(0, Math.min(100, Number(height) || 0))}%`;
        bars.append(bar);
      });
      summary.append(bars);
      const activity = node('article', 'website-preview-card');
      activity.append(node('h3', '', content.floatingTwo.title));
      const list = node('ul', 'website-preview-activity');
      content.floatingTwo.items.forEach((item) => {
        const row = node('li');
        row.append(node('span', 'website-preview-check', item.progress === 'true' ? '•' : '✓'));
        row.append(node('span', '', item.text), node('small', '', item.time));
        list.append(row);
      });
      activity.append(list);
      grid.append(summary, activity);
      preview.append(grid);
    } else if (key === 'home.stats') {
      const grid = node('div', 'website-preview-stats');
      content.forEach((item) => {
        const card = node('article', 'website-preview-card');
        card.append(node('strong', '', item.value), node('span', '', item.label));
        grid.append(card);
      });
      preview.append(grid);
    } else if (key === 'home.services') {
      const grid = node('div', 'website-preview-grid');
      content.forEach((item) => {
        const card = node('article', 'website-preview-card website-preview-service');
        card.append(imagePreview(item.image, item.title), node('h3', '', item.title), node('p', '', item.description));
        grid.append(card);
      });
      preview.append(grid);
    } else if (key === 'home.projects') {
      const grid = node('div', 'website-preview-grid');
      content.forEach((item) => {
        const card = node('article', 'website-preview-card website-preview-project');
        card.append(imagePreview(item.image, item.title), node('small', '', item.initials), node('h3', '', item.title), node('p', '', item.subtitle));
        const highlights = node('ul', 'website-preview-tags');
        item.highlights.forEach((highlight) => highlights.append(node('li', '', highlight)));
        card.append(highlights);
        grid.append(card);
      });
      preview.append(grid);
    } else if (key === 'apparel.catalog') {
      const grid = node('div', 'website-preview-grid website-preview-products');
      content.forEach((item) => {
        const card = node('article', 'website-preview-card website-preview-product');
        card.append(imagePreview(item.image, item.name), node('small', '', item.category), node('h3', '', item.name), node('p', '', item.description));
        card.append(node('strong', '', formatPrice(item.price)), node('small', '', `Rating ${item.rating || 0} / 5`));
        grid.append(card);
      });
      preview.append(grid);
    } else if (key === 'apparel.newsletter') {
      const newsletter = node('article', 'website-preview-card website-preview-newsletter');
      newsletter.append(node('small', '', content.eyebrow), node('h3', '', content.title), node('p', '', content.description));
      const button = node('span', 'website-preview-button', content.button);
      newsletter.append(button);
      preview.append(newsletter);
    }
  }

  function formatPrice(value) {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function loadSelectedEditor() {
    const key = $('#websiteContentKey').value;
    $('#websiteContentHelp').textContent = descriptions[key];
    renderEditor(key);
    renderPreview(key);
    $('#websitePreviewState').textContent = getPreviewState(key);
    setStatus(dirtyKeys.has(key)
      ? 'You have unsaved edits in this section.'
      : canManageContent ? 'Saved website content loaded.' : 'Sign in to load and publish saved website content.');
    updateSaveButton();
  }

  function resetSection() {
    const key = $('#websiteContentKey').value;
    currentContent[key] = JSON.parse(JSON.stringify(savedContent[key]));
    dirtyKeys.delete(key);
    renderEditor(key);
    renderPreview(key);
    $('#websitePreviewState').textContent = getPreviewState(key);
    setStatus('Unsaved edits discarded.', 'success');
    updateSaveButton();
  }

  $('#sideNav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav]');
    if (button) setView(button.dataset.nav);
  });
  $('#websiteContentKey').addEventListener('change', loadSelectedEditor);
  $('#websiteReloadContent').addEventListener('click', resetSection);
  $('#websiteSaveDraft').addEventListener('click', () => saveSelectedContent('draft'));
  $('#websiteSaveContent').addEventListener('click', () => saveSelectedContent('published'));
  window.addEventListener('rafa-admin-authenticated', (event) => {
    canManageContent = ['owner', 'manager'].includes(event.detail?.user?.role);
    loadSavedContent();
  });
  window.addEventListener('rafa-admin-signed-out', () => {
    canManageContent = false;
    updateSaveButton();
  });

  loadSelectedEditor();
})();
