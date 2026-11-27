(() => {
  function getApiBase() {
    const configured = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
    const localBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'http://localhost:3001'
      : '';
    return (configured || localBase).replace(/\/$/, '');
  }

  async function request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${getApiBase()}${path}`, { ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || result.error || `Request failed (${response.status}).`);
    }
    return result;
  }

  function updateHeroCards(content) {
    const cards = content['home.heroCards'];
    if (!cards) return;
    const first = cards.floatingOne;
    if (first) {
      const card = document.querySelector('.float.f1');
      const label = card?.querySelector('small');
      const value = card?.querySelector('b');
      const bars = card?.querySelector('.bars');
      if (label) label.textContent = first.label || '';
      if (value) {
        value.replaceChildren(document.createTextNode(first.value || ''));
        const unit = document.createElement('span');
        unit.textContent = first.unit || '';
        value.append(unit);
      }
      if (bars && Array.isArray(first.bars)) {
        bars.replaceChildren(...first.bars.map((height) => {
          const bar = document.createElement('i');
          const percent = Math.max(0, Math.min(100, Number(height) || 0));
          bar.style.height = `${percent}%`;
          return bar;
        }));
      }
    }
    const second = cards.floatingTwo;
    if (second) {
      const card = document.querySelector('.float.f2');
      const title = card?.querySelector('header b');
      const feed = card?.querySelector('#feed');
      if (title) title.textContent = second.title || '';
      if (feed && Array.isArray(second.items)) {
        feed.replaceChildren(...second.items.map((entry) => {
          const item = document.createElement('li');
          const icon = document.createElement('i');
          icon.textContent = entry.progress === 'true' ? '●' : '✓';
          item.append(icon, document.createTextNode(entry.text || ''));
          const time = document.createElement('span');
          time.textContent = entry.time || '';
          item.append(time);
          if (entry.progress === 'true') item.classList.add('prog');
          item.classList.add('on');
          return item;
        }));
      }
    }
  }

  function updateStats(content) {
    const stats = content['home.stats'];
    if (!Array.isArray(stats)) return;
    const section = document.querySelector('.nums');
    if (section) section.hidden = stats.length === 0;
    document.querySelectorAll('.nums > div').forEach((item, index) => {
      const stat = stats[index];
      item.hidden = !stat;
      if (!stat) return;
      const counter = item.querySelector('[data-n]');
      if (!counter) return;
      counter.dataset.n = String(Number(stat.value) || 0);
      counter.textContent = '0';
      const label = counter.nextElementSibling;
      if (label) label.textContent = stat.label || '';
    });
    window.RAFARunHomeCounters?.();
  }

  function updateServices(content) {
    const services = content['home.services'];
    if (!Array.isArray(services)) return;
    document.querySelectorAll('.bento .tile').forEach((tile, index) => {
      const service = services[index];
      tile.hidden = !service;
      if (!service) return;
      const heading = tile.querySelector('h3');
      const description = tile.querySelector('small');
      if (heading) heading.textContent = service.title || '';
      if (description) description.textContent = service.description || '';
      const image = tile.querySelector('.tile-image');
      const imageUrl = safeMediaUrl(service.image);
      if (image && imageUrl) {
        window.RAFAMedia?.prepareImage(image);
        image.src = imageUrl;
        image.removeAttribute('data-media-id');
      }
    });
  }

  function updateProjects(content) {
    if (Array.isArray(content['home.portfolioItems'])) {
      const scroller = document.querySelector('#work .scroller');
      if (scroller) {
        scroller.replaceChildren(...content['home.portfolioItems'].map((project) => {
          const card = document.createElement('article');
          card.className = 'case';
          const imageUrl = safeMediaUrl(project.image_url);
          if (imageUrl) {
            const image = document.createElement('img');
            image.className = 'case-media';
            image.alt = project.image_alt || '';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.src = imageUrl;
            card.append(image);
          }
          const initials = document.createElement('div');
          initials.className = 'big';
          initials.textContent = project.details?.initials || '';
          const details = document.createElement('div');
          const title = document.createElement('h3');
          title.textContent = project.title || '';
          const summary = document.createElement('p');
          summary.textContent = project.summary || '';
          const highlights = document.createElement('ul');
          const values = Array.isArray(project.details?.highlights) ? project.details.highlights : [];
          highlights.replaceChildren(...values.map((value) => {
            const item = document.createElement('li');
            item.textContent = value;
            return item;
          }));
          details.append(title, summary, highlights);
          card.append(initials, details);
          return card;
        }));
      }
      const section = document.querySelector('#work');
      if (section) section.hidden = content['home.portfolioItems'].length === 0;
      return;
    }
    const projects = content['home.projects'];
    if (!Array.isArray(projects)) return;
    const section = document.querySelector('#work');
    if (section) section.hidden = projects.length === 0;
    document.querySelectorAll('.scroller .case').forEach((card, index) => {
      const project = projects[index];
      card.hidden = !project;
      if (!project) return;
      const initials = card.querySelector('.big');
      const title = card.querySelector('h3');
      const subtitle = card.querySelector('p');
      const highlights = card.querySelector('ul');
      if (project.image) {
        const media = card.querySelector('.case-media');
        const imageUrl = safeMediaUrl(project.image);
        if (media && imageUrl) {
          if (media instanceof HTMLImageElement) {
            window.RAFAMedia?.prepareImage(media);
            media.src = imageUrl;
            media.removeAttribute('data-media-id');
          } else {
            const image = document.createElement('img');
            image.className = media.className.replace('case-media-video', '');
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            image.loading = 'lazy';
            image.decoding = 'async';
            window.RAFAMedia?.prepareImage(image);
            image.src = imageUrl;
            media.replaceWith(image);
          }
        }
      }
      if (initials) initials.textContent = project.initials || '';
      if (title) title.textContent = project.title || '';
      if (subtitle) subtitle.textContent = project.subtitle || '';
      if (highlights && Array.isArray(project.highlights)) {
        highlights.replaceChildren(...project.highlights.map((value) => {
          const item = document.createElement('li');
          item.textContent = value;
          return item;
        }));
      }
    });
  }

  function updateTestimonials(content) {
    const grid = document.querySelector('.qs');
    if (!grid) return;
    const testimonials = Array.isArray(content['home.testimonials'])
      ? content['home.testimonials'].slice(0, 3)
      : [];
    grid.replaceChildren(...testimonials.map((testimonial) => {
      const card = document.createElement('article');
      card.className = 'q reveal in';
      const quote = document.createElement('p');
      quote.textContent = testimonial.quote || '';
      const attribution = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = testimonial.name || '';
      attribution.append(name, document.createTextNode(testimonial.detail ? ` ${testimonial.detail}` : ''));
      card.append(quote, attribution);
      return card;
    }));
    const empty = document.getElementById('testimonialEmpty');
    if (empty) empty.hidden = testimonials.length > 0;
  }

  function safeMediaUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch (error) {
      console.error('Ignoring an invalid content media URL:', error);
      return '';
    }
  }

  function sanitizeCatalog(catalog) {
    return catalog.map((item) => {
      const safeItem = { ...item };
      if (safeItem.image) safeItem.image = safeMediaUrl(safeItem.image);
      if (Array.isArray(safeItem.images)) safeItem.images = safeItem.images.map(safeMediaUrl).filter(Boolean);
      return safeItem;
    });
  }

  function updateNewsletter(content) {
    const newsletter = content['apparel.newsletter'];
    if (!newsletter) return;
    const section = document.querySelector('.newsletter-copy');
    if (!section) return;
    const eyebrow = section.querySelector('.eyebrow');
    const heading = section.querySelector('h2');
    const paragraphs = section.querySelectorAll(':scope > p:not(.eyebrow):not(.newsletter-status)');
    const button = section.querySelector('button[type="submit"]');
    if (eyebrow) eyebrow.textContent = newsletter.eyebrow || '';
    if (heading) heading.textContent = newsletter.title || '';
    if (paragraphs[0]) paragraphs[0].textContent = newsletter.description || '';
    if (button) button.textContent = newsletter.button || 'Sign up';
  }

  function updateFaq(content) {
    const faqs = content['home.faq'];
    const container = document.querySelector('#faq .wrap > div');
    if (!Array.isArray(faqs) || !faqs.length || !container) return;
    container.replaceChildren(...faqs.map((faq, index) => {
      const disclosure = document.createElement('details');
      if (index === 0) disclosure.open = true;
      const question = document.createElement('summary');
      question.textContent = faq.title || '';
      const answer = document.createElement('p');
      answer.textContent = faq.body || faq.summary || '';
      disclosure.append(question, answer);
      return disclosure;
    }));
  }

  function updatePackages(content) {
    const packages = [
      ...(Array.isArray(content['home.eventPackages']) ? content['home.eventPackages'] : []),
      ...(Array.isArray(content['home.dessertPackages']) ? content['home.dessertPackages'] : [])
    ];
    const section = document.querySelector('#packages .wrap');
    if (!section || !packages.length) return;
    let catalogue = section.querySelector('.rafa-managed-packages');
    if (!catalogue) {
      catalogue = document.createElement('div');
      catalogue.className = 'rafa-managed-packages pk';
      section.append(catalogue);
    }
    catalogue.replaceChildren(...packages.map((item) => {
      const card = document.createElement('article');
      card.className = 'pkg';
      const title = document.createElement('h3');
      title.textContent = item.title || '';
      const summary = document.createElement('p');
      summary.textContent = item.summary || '';
      const body = document.createElement('p');
      body.textContent = item.body || '';
      const imageUrl = safeMediaUrl(item.image_url);
      if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = item.image_alt || '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.style.width = '100%';
        image.style.height = '180px';
        image.style.objectFit = 'cover';
        card.append(image);
      }
      card.append(title, summary, body);
      if (item.details?.price) {
        const price = document.createElement('div');
        price.className = 'price';
        price.textContent = String(item.details.price);
        card.insertBefore(price, summary);
      }
      return card;
    }));
  }

  function applySectionSettings(content) {
    const visibility = content['home.sectionVisibility'];
    if (visibility && typeof visibility === 'object') {
      const selectors = {
        'home.heroCards': '.hero .float',
        'home.stats': '.nums',
        'home.services': '#services',
        'home.projects': '#work',
        'home.testimonials': '#testimonials',
        'home.packages': '#packages',
        'home.faq': '#faq',
        'apparel.catalog': '#catalog',
        'apparel.newsletter': '.newsletter'
      };
      Object.entries(selectors).forEach(([key, selector]) => {
        const sections = document.querySelectorAll(selector);
        if (visibility[key] === false) {
          sections.forEach((section) => { section.hidden = true; });
        }
      });
    }
    const order = content['home.sectionOrder'];
    const selectorByKey = {
      'home.services': '#services',
      'home.projects': '#work',
      'home.testimonials': '#testimonials',
      'home.packages': '#packages',
      'home.faq': '#faq'
    };
    if (!Array.isArray(order)) return;
    const orderedSections = order
      .map((key) => document.querySelector(selectorByKey[key]))
      .filter((section) => section?.parentElement?.tagName === 'MAIN');
    if (orderedSections.length < 2) return;
    const parent = orderedSections[0].parentElement;
    const slots = orderedSections.map((section) => {
      const marker = document.createComment('managed-section');
      parent.insertBefore(marker, section);
      return marker;
    });
    slots.forEach((slot, index) => slot.replaceWith(orderedSections[index]));
  }

  function applyContent(content) {
    updateHeroCards(content);
    updateStats(content);
    updateServices(content);
    updateProjects(content);
    updateTestimonials(content);
    updateNewsletter(content);
    updateFaq(content);
    updatePackages(content);
    applySectionSettings(content);
    if (Array.isArray(content['apparel.catalog'])) {
      content['apparel.catalog'] = sanitizeCatalog(content['apparel.catalog']);
    }
    window.dispatchEvent(new CustomEvent('rafa:content-updated', { detail: { content } }));
  }

  const ready = request('/api/site-content')
    .then((result) => {
      const content = result.content || {};
      applyContent(content);
      return content;
    })
    .catch((error) => {
      console.error('Unable to load website content from the server; default page content remains visible:', error);
      return {};
    });

  window.RAFAPublicContent = {
    ready,
    getApiBase,
    async subscribeNewsletter(email) {
      return request('/api/newsletter-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
    },
    async submitTestimonial(testimonial) {
      return request('/api/testimonials', {
        method: 'POST',
        body: JSON.stringify(testimonial)
      });
    }
  };

  const testimonialForm = document.getElementById('testimonialForm');
  if (testimonialForm) {
    const status = document.getElementById('testimonialFormStatus');
    testimonialForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = testimonialForm.querySelector('button[type="submit"]');
      const controls = [...testimonialForm.querySelectorAll('input, textarea, button')];
      const values = new FormData(testimonialForm);
      controls.forEach((control) => { control.disabled = true; });
      status.textContent = 'Submitting your testimonial...';
      status.dataset.state = 'sending';
      try {
        await window.RAFAPublicContent.submitTestimonial({
          name: values.get('name'),
          quote: values.get('quote'),
          detail: values.get('detail'),
          consent: values.get('consent') === 'on'
        });
        testimonialForm.reset();
        status.textContent = 'Thank you. Your testimonial is awaiting review before publication.';
        status.dataset.state = 'success';
      } catch (error) {
        console.error('Unable to submit testimonial:', error);
        status.textContent = `${error.message} Your testimonial is still here; please try again.`;
        status.dataset.state = 'error';
      } finally {
        controls.forEach((control) => { control.disabled = false; });
        submit.disabled = false;
      }
    });
  }
})();
