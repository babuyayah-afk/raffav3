(function () {
  const pages = [
    { href: 'index.html#services', label: 'Services' },
    { href: 'index.html#work', label: 'Work' },
    { href: 'index.html#process', label: 'Process' },
    { href: 'index.html#packages', label: 'Pricing' },
    { href: 'index.html#faq', label: 'FAQ' },
    { file: 'apparels.html', label: 'Apparels' },
    { file: 'contact.html', label: 'Contact' },
    { file: 'cart.html', label: 'Cart' }
  ];
  const pageFile = window.location.pathname.split('/').pop() || 'index.html';
  const currentPage = pages.find((page) => page.file === pageFile);
  const header = document.getElementById('siteHeader');
  const footer = document.querySelector('.shared-footer');

  if (!document.getElementById('top')) document.body.id = 'top';

  if (header) {
    const navigation = pages.map((page) => {
      const current = page.file && page.file === currentPage?.file;
      const label = page.file === 'cart.html'
        ? `${page.label}<span class="shared-cart-count" id="cartCount" aria-live="polite">0</span>`
        : page.label;
      return `<a href="${page.href || page.file}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
    }).join('');

    header.className = 'shared-header';
    header.innerHTML = `
      <div class="shared-shell-inner">
        <a class="shared-brand" href="index.html" aria-label="RaFa home">
          <span class="shared-brand-mark" aria-hidden="true">R</span>
          <span class="shared-brand-name">RaFa</span>
        </a>
        <nav class="shared-nav" id="primaryNav" aria-label="Primary navigation">${navigation}</nav>
        <div class="shared-header-actions">
          <a class="shared-contact-link" href="contact.html?topic=events">Plan my event</a>
          <button class="menu-toggle shared-menu-toggle" id="menuToggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="primaryNav" data-desktop-breakpoint="1101">
            <svg viewBox="0 0 20 16" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><line x1="0" y1="1" x2="20" y2="1"/><line x1="0" y1="8" x2="20" y2="8"/><line x1="0" y1="15" x2="20" y2="15"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  const cartCount = header?.querySelector('#cartCount');
  if (cartCount) {
    const updateCartCount = () => {
      try {
        const items = JSON.parse(window.localStorage.getItem('rafa-apparel-bag-preview') || '[]');
        const count = Array.isArray(items)
          ? items.reduce((total, item) => total + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0), 0)
          : 0;
        cartCount.textContent = String(count);
        cartCount.setAttribute('aria-label', `${count} ${count === 1 ? 'item' : 'items'} in cart`);
      } catch (error) {
        console.error('Unable to read the saved apparel bag:', error);
        cartCount.textContent = '0';
        cartCount.setAttribute('aria-label', 'Cart count unavailable');
      }
    };
    updateCartCount();
    window.addEventListener('storage', (event) => {
      if (event.key === 'rafa-apparel-bag-preview') updateCartCount();
    });
    window.addEventListener('rafa:apparel-cart-change', updateCartCount);
  }

  if (footer) {
    footer.innerHTML = `
      <div class="shared-shell-inner shared-footer-layout">
        <div class="shared-footer-brand">
          <a class="shared-brand shared-footer-logo" href="index.html" aria-label="RAFA home">
            <span class="shared-brand-name">RAFA</span>
            <span class="shared-brand-tagline">Made for every moment</span>
          </a>
          <p>Thoughtful details for your celebrations, wardrobe and everyday moments.</p>
          <p class="shared-footer-note">Online ordering and payment are not connected yet.</p>
        </div>
        <div class="shared-footer-group">
          <h2>Explore</h2>
          <a href="index.html">Home</a>
          <a href="contact.html?topic=events">Events</a>
          <a href="index.html#work">Work</a>
          <a href="contact.html?topic=desserts">Celebration desserts</a>
          <a href="apparels.html">Apparels</a>
          <a href="cart.html">Apparel cart</a>
        </div>
        <div class="shared-footer-group shared-footer-help">
          <h2>Help &amp; information</h2>
          <a href="index.html#faq">Frequently asked questions</a>
          <a href="contact.html">Contact &amp; support</a>
          <a href="contact.html?topic=desserts">Dessert inquiries</a>
        </div>
        <div class="shared-footer-group shared-footer-connect">
          <h2>Stay in the loop</h2>
          <p>News and updates from RAFA on celebrations, desserts and new arrivals.</p>
          <form class="shared-footer-newsletter">
            <label class="sr-only" for="footerNewsletterEmail">Email address</label>
            <input id="footerNewsletterEmail" name="email" type="email" autocomplete="email" placeholder="Your email address" required>
            <button type="submit">Sign up <span aria-hidden="true">→</span></button>
          </form>
          <p class="shared-footer-newsletter-status" role="status" aria-live="polite"></p>
          <p class="shared-footer-social-note">Social profiles will be added before launch.</p>
          <a href="contact.html?topic=events">Plan an event <span aria-hidden="true">↗</span></a>
        </div>
        <div class="shared-footer-policies" aria-label="Legal policies">
          Privacy, terms, returns, cookies and shipping policies will be published before launch.
        </div>
        <div class="shared-footer-bottom">
          <span>© <span data-footer-year></span> RAFA. All rights reserved.</span>
          <span>Nairobi, Kenya</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </div>
    `;
    footer.classList.add('shared-footer');
    footer.id = 'contact';
    const year = footer.querySelector('[data-footer-year]');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  const utilityDock = document.createElement('div');
  utilityDock.className = 'site-utility-dock';
  utilityDock.setAttribute('role', 'group');
  utilityDock.setAttribute('aria-label', 'Quick actions');
  utilityDock.innerHTML = `
    <button class="site-utility-button" id="assistantToggle" type="button" aria-label="Open RAFA assistant" aria-expanded="false" aria-controls="siteAssistant">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-9.5A7.5 7.5 0 0 1 10.5 4h2A7.5 7.5 0 0 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></svg>
    </button>
    <button class="site-utility-button" id="scrollToTop" type="button" aria-label="Scroll to top" title="Scroll to top" disabled>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
    </button>
  `;
  const assistant = document.createElement('section');
  assistant.className = 'site-assistant';
  assistant.id = 'siteAssistant';
  assistant.hidden = true;
  assistant.setAttribute('role', 'dialog');
  assistant.setAttribute('aria-labelledby', 'siteAssistantTitle');
  assistant.innerHTML = `
    <div class="site-assistant-heading">
      <h2 id="siteAssistantTitle">RAFA quick help</h2>
      <button class="site-assistant-close" id="assistantClose" type="button" aria-label="Close RAFA assistant">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <p class="site-assistant-greeting">Hi! What can we help you find?</p>
    <nav class="site-assistant-links" aria-label="Quick help topics">
      <a href="contact.html?topic=events">Plan an event <span aria-hidden="true">↗</span></a>
      <a href="contact.html?topic=desserts">Explore desserts <span aria-hidden="true">↗</span></a>
      <a href="apparels.html">Shop apparels <span aria-hidden="true">↗</span></a>
      <a href="contact.html">Talk to the team <span aria-hidden="true">↗</span></a>
    </nav>
  `;
  document.body.append(utilityDock, assistant);

  const assistantToggle = utilityDock.querySelector('#assistantToggle');
  const assistantClose = assistant.querySelector('#assistantClose');
  const scrollToTop = utilityDock.querySelector('#scrollToTop');
  const setAssistantOpen = (open) => {
    assistant.hidden = !open;
    assistantToggle.setAttribute('aria-expanded', String(open));
    assistantToggle.setAttribute('aria-label', `${open ? 'Close' : 'Open'} RAFA assistant`);
    if (open) assistantClose.focus();
  };
  const updateScrollControl = () => {
    scrollToTop.disabled = window.scrollY <= 24;
  };

  assistantToggle.addEventListener('click', () => {
    setAssistantOpen(assistant.hidden);
  });
  assistantClose.addEventListener('click', () => {
    setAssistantOpen(false);
    assistantToggle.focus();
  });
  assistant.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setAssistantOpen(false);
      assistantToggle.focus();
    }
  });
  scrollToTop.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  });
  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScrollControl();
    });
  }, { passive: true });
  updateScrollControl();
})();
