(() => {
  const $ = (selector) => document.querySelector(selector);
  const apiBase = (document.querySelector('meta[name="rafa-api-base"]')?.content.trim() ||
    (['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : '')).replace(/\/$/, '');
  let isAuthenticated = false;
  let canManage = false;
  let currentItem = null;
  let entries = [];
  let mediaAssets = [];
  let sections = [];
  let sectionsDirty = false;
  let activeAdminView = '';

  function setStatus(selector, message, state = '') {
    const element = $(selector);
    element.textContent = message;
    element.dataset.state = state;
  }

  async function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
      if (window.crypto?.randomUUID) headers.set('X-Request-Id', window.crypto.randomUUID());
    }
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.message || result?.error || `Request failed (${response.status}).`);
    }
    return result;
  }

  function activeType() {
    return $('#showcaseTypeFilter').value;
  }

  function setTabs(name) {
    document.querySelectorAll('[data-showcase-view]').forEach((button) => {
      const selected = button.dataset.showcaseView === name;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#websiteContentPanel').hidden = name !== 'content';
    $('#showcaseAdminView').hidden = name !== 'showcase';
    $('#showcaseSettingsView').hidden = name !== 'sections';
    if (name === 'showcase') {
      if (isAuthenticated) refreshEntries();
      else setStatus('#showcaseListStatus', 'Sign in to load showcase entries.');
    }
    if (name === 'sections') {
      if (isAuthenticated) refreshSectionsAndMedia();
      else {
        setStatus('#sectionStatus', 'Sign in to load section settings.');
        setStatus('#mediaStatus', 'Sign in to load the media library.');
      }
    }
  }

  function renderEntries() {
    const list = $('#showcaseEntryList');
    list.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'showcase-help';
      empty.textContent = 'No active entries in this filter.';
      list.append(empty);
      return;
    }
    entries.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'showcase-entry-button';
      button.setAttribute('aria-current', currentItem?.id === item.id ? 'true' : 'false');
      const title = document.createElement('span');
      title.textContent = item.title;
      const status = document.createElement('small');
      status.textContent = item.status === 'published' ? 'Published' : 'Draft';
      button.append(title, status);
      button.addEventListener('click', () => selectEntry(item));
      list.append(button);
    });
  }

  async function refreshEntries() {
    if (!isAuthenticated) {
      setStatus('#showcaseListStatus', 'Sign in to load showcase entries.');
      return;
    }
    try {
      const params = new URLSearchParams({
        type: activeType(),
        status: $('#showcaseStatusFilter').value,
        page: '1',
        limit: '50'
      });
      const result = await request(`/api/admin/showcase?${params}`);
      entries = result.items || [];
      renderEntries();
      const selected = entries.find((item) => item.id === currentItem?.id);
      if (selected) selectEntry(selected, false);
      setStatus('#showcaseListStatus', `${result.total || entries.length} entr${(result.total || entries.length) === 1 ? 'y' : 'ies'} loaded.`, 'success');
    } catch (error) {
      console.error('Unable to load showcase entries:', error);
      setStatus('#showcaseListStatus', `${error.message} Check your content access and try again.`, 'error');
    }
  }

  function selectEntry(item, rerender = true) {
    currentItem = item;
    $('#showcaseTitle').value = item.title || '';
    $('#showcaseSlug').value = item.slug || '';
    $('#showcaseSummary').value = item.summary || '';
    $('#showcaseBody').value = item.body || '';
    $('#showcaseDetails').value = JSON.stringify(item.details || {}, null, 2);
    $('#showcaseImage').value = item.image_asset_id || '';
    $('#showcaseDisplayOrder').value = String(item.display_order || 0);
    $('#showcaseVisible').checked = item.is_visible !== false;
    $('#showcaseFeatured').checked = item.is_featured === true;
    $('#showcasePreviewStatus').value = item.status === 'published' && !item.has_draft
      ? 'published'
      : 'draft';
    $('#showcaseArchive').disabled = !canManage;
    $('#showcaseSave').disabled = !canManage;
    $('#showcaseArchive').dataset.itemId = item.id;
    updatePreview();
    if (rerender) renderEntries();
    setStatus('#showcaseEditorStatus', item.has_draft
      ? 'Editing the draft; the published version remains live until you publish.'
      : item.status === 'published' ? 'Editing the live version. Save as draft to stage changes first.' : 'Editing a draft.', 'success');
  }

  function newEntry() {
    currentItem = null;
    $('#showcaseEditor').reset();
    $('#showcaseDetails').value = '{}';
    $('#showcaseImage').value = '';
    $('#showcaseDisplayOrder').value = '0';
    $('#showcaseVisible').checked = true;
    $('#showcaseFeatured').checked = false;
    $('#showcasePreviewStatus').value = 'draft';
    $('#showcaseArchive').disabled = true;
    $('#showcaseSave').disabled = !canManage;
    updatePreview();
    renderEntries();
    setStatus('#showcaseEditorStatus', 'Create a draft or publish this entry when ready.');
  }

  function updatePreview() {
    $('#showcasePreviewTitle').textContent = $('#showcaseTitle').value || 'New entry';
    $('#showcasePreviewSummary').textContent = $('#showcaseSummary').value;
    $('#showcasePreviewBody').textContent = $('#showcaseBody').value;
    const asset = mediaAssets.find((item) => item.id === $('#showcaseImage').value);
    const imageUrl = asset?.image_url || (currentItem?.image_asset_id === $('#showcaseImage').value
      ? currentItem.image_url
      : '');
    const imageBox = $('#showcasePreviewImage');
    imageBox.replaceChildren();
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = asset?.alt_text || currentItem?.image_alt || '';
      image.loading = 'lazy';
      imageBox.append(image);
    }
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!canManage) return;
    let details;
    try {
      details = JSON.parse($('#showcaseDetails').value);
    } catch {
      setStatus('#showcaseEditorStatus', 'Additional details must be valid JSON.', 'error');
      return;
    }
    if (!details || Array.isArray(details) || typeof details !== 'object') {
      setStatus('#showcaseEditorStatus', 'Additional details must be a JSON object.', 'error');
      return;
    }
    const item = {
      type: activeType(),
      slug: $('#showcaseSlug').value.trim(),
      title: $('#showcaseTitle').value.trim(),
      summary: $('#showcaseSummary').value,
      body: $('#showcaseBody').value,
      details,
      imageAssetId: $('#showcaseImage').value || null,
      status: $('#showcasePreviewStatus').value,
      isVisible: $('#showcaseVisible').checked,
      isFeatured: $('#showcaseFeatured').checked,
      displayOrder: Number($('#showcaseDisplayOrder').value)
    };
    if (!$('#showcaseEditor').reportValidity()) return;
    const button = $('#showcaseSave');
    button.disabled = true;
    setStatus('#showcaseEditorStatus', item.status === 'draft' ? 'Saving draft...' : 'Publishing entry...');
    try {
      const path = currentItem
        ? `/api/admin/showcase/${encodeURIComponent(currentItem.id)}`
        : '/api/admin/showcase';
      const result = await request(path, {
        method: currentItem ? 'PUT' : 'POST',
        body: JSON.stringify(item)
      });
      currentItem = result.item;
      await refreshEntries();
      setStatus('#showcaseEditorStatus', item.status === 'draft'
        ? 'Draft saved. The public website remains unchanged.'
        : 'Entry published.', 'success');
    } catch (error) {
      console.error('Unable to save showcase entry:', error);
      setStatus('#showcaseEditorStatus', `${error.message} The entry was not saved.`, 'error');
    } finally {
      button.disabled = !canManage;
    }
  }

  async function archiveEntry() {
    if (!currentItem || !canManage || !window.confirm('Archive this entry? It will no longer appear on the website.')) return;
    try {
      await request(`/api/admin/showcase/${encodeURIComponent(currentItem.id)}`, { method: 'DELETE' });
      currentItem = null;
      newEntry();
      await refreshEntries();
      setStatus('#showcaseEditorStatus', 'Entry archived.', 'success');
    } catch (error) {
      console.error('Unable to archive showcase entry:', error);
      setStatus('#showcaseEditorStatus', `${error.message} The entry was not archived.`, 'error');
    }
  }

  function renderAssets() {
    const select = $('#showcaseImage');
    const selected = select.value;
    select.replaceChildren(new Option('No image', ''));
    mediaAssets.forEach((asset) => select.add(new Option(
      `${asset.original_name} (${asset.usage?.length || 0} use${asset.usage?.length === 1 ? '' : 's'})`,
      asset.id
    )));
    if (mediaAssets.some((asset) => asset.id === selected)) select.value = selected;
    const list = $('#showcaseMediaList');
    list.replaceChildren();
    if (!mediaAssets.length) {
      const empty = document.createElement('p');
      empty.className = 'showcase-help';
      empty.textContent = 'No media files found.';
      list.append(empty);
      return;
    }
    mediaAssets.forEach((asset) => {
      const card = document.createElement('article');
      card.className = 'showcase-media-card';
      const image = document.createElement('img');
      image.src = asset.image_url;
      image.alt = asset.alt_text || '';
      image.loading = 'lazy';
      const detail = document.createElement('div');
      const name = document.createElement('p');
      name.textContent = asset.original_name;
      const usage = document.createElement('small');
      usage.textContent = `${asset.usage?.length || 0} content use${asset.usage?.length === 1 ? '' : 's'}`;
      const alt = document.createElement('input');
      alt.className = 'showcase-control';
      alt.maxLength = 500;
      alt.value = asset.alt_text || '';
      alt.setAttribute('aria-label', `Alternative text for ${asset.original_name}`);
      const actions = document.createElement('div');
      actions.className = 'showcase-media-actions';
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'website-secondary';
      save.textContent = 'Save alt text';
      save.disabled = !canManage;
      save.addEventListener('click', () => updateAsset(asset.id, alt.value, false));
      const archive = document.createElement('button');
      archive.type = 'button';
      archive.className = 'website-secondary';
      archive.textContent = 'Archive';
      archive.disabled = !canManage;
      archive.addEventListener('click', () => {
        if (window.confirm(`Archive ${asset.original_name}?`)) updateAsset(asset.id, asset.alt_text || '', true);
      });
      actions.append(save, archive);
      detail.append(name, usage, alt, actions);
      card.append(image, detail);
      list.append(card);
    });
  }

  async function refreshAssets() {
    if (!isAuthenticated) {
      setStatus('#mediaStatus', 'Sign in to load the media library.');
      return;
    }
    const search = $('#mediaSearch').value.trim();
    const params = new URLSearchParams({ page: '1', limit: '50', search });
    const result = await request(`/api/admin/media?${params}`);
    mediaAssets = result.items || [];
    renderAssets();
    updatePreview();
    setStatus('#mediaStatus', `${mediaAssets.length} file${mediaAssets.length === 1 ? '' : 's'} loaded.`, 'success');
  }

  async function updateAsset(id, altText, archive) {
    try {
      await request(`/api/admin/media/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ altText, archive })
      });
      setStatus('#mediaStatus', archive ? 'Media asset archived.' : 'Alternative text saved.', 'success');
      try {
        await refreshAssets();
      } catch (error) {
        console.error('Unable to refresh the media library after update:', error);
        setStatus('#mediaStatus', `The update succeeded, but the library could not refresh: ${error.message}`, 'error');
      }
    } catch (error) {
      console.error('Unable to update media asset:', error);
      setStatus('#mediaStatus', `${error.message} The media asset was not changed.`, 'error');
    }
  }

  async function uploadAsset(event) {
    event.preventDefault();
    if (!canManage) return;
    const file = $('#showcaseFile').files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setStatus('#mediaStatus', 'Choose a JPEG, PNG or WebP image no larger than 5 MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setStatus('#mediaStatus', 'The selected image could not be read.', 'error');
    reader.onload = async () => {
      try {
        await request('/api/admin/media', {
          method: 'POST',
          body: JSON.stringify({
            name: file.name,
            data: reader.result,
            altText: $('#showcaseAltText').value.trim()
          })
        });
        $('#showcaseUploadForm').reset();
        setStatus('#mediaStatus', 'Image uploaded and added to the private library.', 'success');
        try {
          await refreshAssets();
        } catch (error) {
          console.error('Unable to refresh the media library after upload:', error);
          setStatus('#mediaStatus', `Image uploaded, but the library could not refresh: ${error.message}`, 'error');
        }
      } catch (error) {
        console.error('Unable to upload media asset:', error);
        setStatus('#mediaStatus', `${error.message} The image was not added.`, 'error');
      }
    };
    reader.readAsDataURL(file);
  }

  function renderSections() {
    const list = $('#siteSectionList');
    list.replaceChildren();
    sections.forEach((section) => {
      const row = document.createElement('div');
      row.className = 'site-section-row';
      const title = document.createElement('label');
      title.textContent = section.title;
      const order = document.createElement('input');
      order.className = 'showcase-control';
      order.type = 'number';
      order.min = '0';
      order.max = '10000';
      order.value = section.display_order;
      order.setAttribute('aria-label', `${section.title} display order`);
      const visibleLabel = document.createElement('label');
      visibleLabel.className = 'showcase-check';
      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.checked = section.is_visible;
      visibleLabel.append(visible, document.createTextNode('Shown'));
      [order, visible].forEach((control) => control.addEventListener('change', () => {
        section.display_order = Number(order.value);
        section.is_visible = visible.checked;
        sectionsDirty = true;
        $('#saveSiteSections').disabled = !canManage;
      }));
      row.append(title, order, visibleLabel);
      list.append(row);
    });
  }

  async function loadSections() {
    const result = await request('/api/admin/site-sections');
    sections = result.items || [];
    sectionsDirty = false;
    renderSections();
    $('#saveSiteSections').disabled = !canManage;
    setStatus('#sectionStatus', 'Section settings loaded.', 'success');
  }

  async function saveSections() {
    if (!canManage || !sectionsDirty) return;
    try {
      await request('/api/admin/site-sections', {
        method: 'PUT',
        body: JSON.stringify({
          items: sections.map((section) => ({
            sectionKey: section.section_key,
            title: section.title,
            displayOrder: section.display_order,
            isVisible: section.is_visible
          }))
        })
      });
      sectionsDirty = false;
      $('#saveSiteSections').disabled = true;
      setStatus('#sectionStatus', 'Homepage section order and visibility saved.', 'success');
      try {
        await loadSections();
      } catch (error) {
        console.error('Unable to reload saved homepage section settings:', error);
        setStatus('#sectionStatus', `Settings saved, but could not reload them: ${error.message}`, 'error');
      }
    } catch (error) {
      console.error('Unable to save homepage section settings:', error);
      setStatus('#sectionStatus', `${error.message} Section settings were not saved.`, 'error');
    }
  }

  async function refreshSectionsAndMedia() {
    if (!isAuthenticated) {
      setStatus('#sectionStatus', 'Sign in to load section settings.');
      setStatus('#mediaStatus', 'Sign in to load the media library.');
      return;
    }
    const results = await Promise.allSettled([loadSections(), refreshAssets()]);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error('Unable to load website settings:', result.reason);
        setStatus(result.reason?.message?.includes('media')
          ? '#mediaStatus'
          : '#sectionStatus', `${result.reason.message} Check your access and retry.`, 'error');
      }
    });
  }

  document.querySelectorAll('[data-showcase-view]').forEach((button) => {
    button.addEventListener('click', () => setTabs(button.dataset.showcaseView));
  });
  $('#showcaseTypeFilter').addEventListener('change', () => {
    newEntry();
    refreshEntries();
  });
  $('#showcaseStatusFilter').addEventListener('change', refreshEntries);
  $('#showcaseRefresh').addEventListener('click', refreshEntries);
  $('#showcaseNew').addEventListener('click', newEntry);
  $('#showcaseEditor').addEventListener('submit', saveEntry);
  $('#showcaseArchive').addEventListener('click', archiveEntry);
  ['#showcaseTitle', '#showcaseSummary', '#showcaseBody', '#showcaseImage'].forEach((selector) => {
    $(selector).addEventListener('input', updatePreview);
    $(selector).addEventListener('change', updatePreview);
  });
  $('#showcaseFile').addEventListener('change', () => {
    $('#showcaseUpload').disabled = !canManage || !$('#showcaseFile').files.length;
  });
  $('#showcaseUploadForm').addEventListener('submit', uploadAsset);
  $('#mediaSearch').addEventListener('change', () => refreshAssets().catch((error) =>
    setStatus('#mediaStatus', error.message, 'error')));
  $('#sectionRefresh').addEventListener('click', refreshSectionsAndMedia);
  $('#saveSiteSections').addEventListener('click', saveSections);

  window.addEventListener('rafa-admin-authenticated', (event) => {
    isAuthenticated = true;
    canManage = ['owner', 'manager'].includes(event.detail?.user?.role);
    $('#showcaseSave').disabled = !canManage;
    $('#showcaseUpload').disabled = !canManage || !$('#showcaseFile').files.length;
    if (activeAdminView === 'CMS') {
      refreshEntries();
      refreshSectionsAndMedia();
    }
  });
  window.addEventListener('rafa-admin-signed-out', () => {
    isAuthenticated = false;
    canManage = false;
    $('#showcaseSave').disabled = true;
    $('#showcaseArchive').disabled = true;
    $('#showcaseUpload').disabled = true;
    $('#saveSiteSections').disabled = true;
  });
  window.addEventListener('rafa-admin-view-changed', (event) => {
    if (!['Website Content', 'CMS', 'Apparels'].includes(event.detail)) return;
    activeAdminView = event.detail;
    setTabs(event.detail === 'CMS' ? 'showcase' : 'content');
  });
})();
