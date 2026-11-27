function setImageSource(image, source) {
  window.RAFAMedia?.prepareImage(image);
  image.src = source;
}

const defaultProducts = [
  {
    name: 'Celine Wrap Blazer',
    category: 'clothes',
    description: 'Structured drape in a soft neutral tone for everyday polish.',
    price: 189,
    rating: 4.9,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Luna Knit Set',
    category: 'clothes',
    description: 'A cozy matching co-ord with a relaxed silhouette and refined finish.',
    price: 146,
    rating: 4.8,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Aster Leather Sneaker',
    category: 'shoes',
    description: 'Low-profile everyday leather sneakers with cushioned soles.',
    price: 132,
    rating: 4.7,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Sloane Slingback',
    category: 'shoes',
    description: 'A classic heel with sculpted ease and a refined pointed toe.',
    price: 170,
    rating: 4.9,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Mila Structured Tote',
    category: 'handbags',
    description: 'A clean carry-all designed for work, travel and city errands.',
    price: 214,
    rating: 4.8,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Sera Mini Shoulder',
    category: 'handbags',
    description: 'Compact shape, polished hardware and everyday utility.',
    price: 168,
    rating: 4.7,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Noor Gold Hoop',
    category: 'accessories',
    description: 'A lightweight statement finish for easy day-to-night styling.',
    price: 44,
    rating: 4.9,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Vale Silk Scarf',
    category: 'accessories',
    description: 'Add movement, color and polish with a soft silk finish.',
    price: 52,
    rating: 4.8,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Ari Cotton Shirt',
    category: 'clothes',
    description: 'Soft structure and an oversized fit for effortless layering.',
    price: 96,
    rating: 4.8,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Nora Trench Coat',
    category: 'clothes',
    description: 'Minimal outerwear with a clean drape and weather-ready finish.',
    price: 228,
    rating: 5.0,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Harlow Slide',
    category: 'shoes',
    description: 'A quiet statement sandal for warm weather and easy movement.',
    price: 114,
    rating: 4.7,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  },
  {
    name: 'Rhea Chain Bag',
    category: 'handbags',
    description: 'Glossy polish and a streamlined silhouette in a functional shape.',
    price: 178,
    rating: 4.8,
    image: window.RAFAMedia.image('apparel-look', 900, 80)
  }
];
let products = window.RAFAContent
  ? window.RAFAContent.getCollection('apparel')
  : defaultProducts.map((product) => ({ ...product, price: window.RAFACurrency.convertToKES(product.price, 'USD') }));
const productImages = [
  window.RAFAMedia.image('apparel-coat', 700, 85),
  window.RAFAMedia.image('apparel-people', 700, 85),
  window.RAFAMedia.image('apparel-sneakers', 700, 85),
  window.RAFAMedia.image('apparel-shoes', 700, 85),
  window.RAFAMedia.image('apparel-bag', 700, 85),
  window.RAFAMedia.image('apparel-tops', 700, 85),
  window.RAFAMedia.image('apparel-jewelry', 700, 85),
  window.RAFAMedia.image('apparel-decor', 700, 85),
  window.RAFAMedia.image('apparel-scarf', 700, 85),
  window.RAFAMedia.image('apparel-outfit', 700, 85),
  window.RAFAMedia.image('apparel-shoes-alt', 700, 85),
  window.RAFAMedia.image('apparel-bag', 700, 85)
];

const catalogGrid = document.getElementById('catalogGrid');
const categoryButtons = [...document.querySelectorAll('.category-card, .filter-chip')];
const productSort = document.getElementById('productSort');
const catalogEmpty = document.getElementById('catalogEmpty');
const catalogStatus = document.getElementById('catalogStatus');
const quickView = document.getElementById('productQuickView');
const quickViewContent = document.getElementById('productQuickViewContent');
const wishlistKey = 'rafa-apparel-wishlist-preview';
const bagKey = 'rafa-apparel-bag-preview';
let currentFilter = 'all';
let activeQuickView = null;
let quickViewImageIndex = 0;
let previewLoadError = false;

const previewColors = {
  clothes: [
    { name: 'Oat', value: '#c9b89f' },
    { name: 'Ink', value: '#292725' },
    { name: 'Sage', value: '#7c806d' },
    { name: 'Stone', value: '#ded8cf' }
  ],
  shoes: [
    { name: 'Ivory', value: '#eee8dc' },
    { name: 'Cocoa', value: '#75543e' },
    { name: 'Black', value: '#272522' }
  ],
  handbags: [
    { name: 'Tan', value: '#a7794f' },
    { name: 'Black', value: '#272522' },
    { name: 'Burgundy', value: '#713d44' }
  ],
  accessories: [
    { name: 'Gold', value: '#c4a15b' },
    { name: 'Silver', value: '#b8bab9' },
    { name: 'Onyx', value: '#292725' }
  ]
};

function readPreviewList(key) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error('Saved preview data must be a list.');
    return parsed;
  } catch (error) {
    console.error(`Unable to load ${key}:`, error);
    previewLoadError = true;
    if (catalogStatus) catalogStatus.textContent = 'A saved preview list could not be loaded. You can still browse the catalogue.';
    return [];
  }
}

let wishlist = readPreviewList(wishlistKey);
let bag = readPreviewList(bagKey);

function productId(product) {
  return String(product.id || product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
}

function getSizes(product) {
  if (Array.isArray(product.sizes) && product.sizes.length) return product.sizes;
  if (product.category === 'shoes') return ['EU 36', 'EU 37', 'EU 38', 'EU 39', 'EU 40', 'EU 41'];
  if (product.category === 'clothes') return ['XS', 'S', 'M', 'L', 'XL'];
  return [];
}

function getColors(product) {
  const colors = Array.isArray(product.colors) && product.colors.length
    ? product.colors
    : previewColors[product.category] || [];
  return colors.map((color) => typeof color === 'string'
    ? { name: color, value: color }
    : color);
}

function getProductImages(product, productIndex, colorName = '') {
  const selectedColor = getColors(product).find((color) => color.name === colorName);
  const colorGallery = Array.isArray(selectedColor?.images)
    ? selectedColor.images.filter((image) => typeof image === 'string' && image.trim())
    : selectedColor?.image ? [selectedColor.image] : [];
  if (colorGallery.length) return colorGallery;
  const gallery = Array.isArray(product.images)
    ? product.images.filter((image) => typeof image === 'string' && image.trim())
    : [];
  if (gallery.length) return gallery;
  const preferredImage = typeof product.image === 'string' ? product.image.trim() : '';
  const genericImage = window.RAFAMedia.image('apparel-look', 900, 80);
  return [preferredImage && preferredImage !== genericImage ? preferredImage : productImages[productIndex % productImages.length]];
}

function getImageAlt(product, colorName = '') {
  const selectedColor = getColors(product).find((color) => color.name === colorName);
  const hasColorImage = Boolean(selectedColor?.image)
    || Boolean(Array.isArray(selectedColor?.images) && selectedColor.images.length);
  return hasColorImage ? `${product.name} in ${colorName}` : product.name;
}

function savePreviewList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Unable to save ${key}:`, error);
    if (catalogStatus) catalogStatus.textContent = 'Your browser could not save this preview. No shopping change was made.';
    return false;
  }
}

function updateBagSummary() {
  const summary = document.getElementById('apparelBagSummary');
  if (!summary) return;
  const count = bag.reduce((total, item) => total + item.quantity, 0);
  summary.textContent = `Bag preview · ${count}`;
}

window.addEventListener('storage', (event) => {
  if (event.key !== bagKey) return;
  bag = readPreviewList(bagKey);
  updateBagSummary();
});

window.addEventListener('rafa:apparel-cart-change', () => {
  bag = readPreviewList(bagKey);
  updateBagSummary();
});

function addPreviewItem(product, size, color) {
  const id = productId(product);
  const existing = bag.find((item) => item.id === id && item.size === size && item.color === color);
  const nextBag = existing
    ? bag.map((item) => item === existing ? { ...item, quantity: item.quantity + 1 } : item)
    : [...bag, {
      id,
      name: product.name,
      price: Number(product.price),
      size,
      color,
      quantity: 1,
      image: getProductImages(product, products.indexOf(product), color)[0]
    }];
  if (!savePreviewList(bagKey, nextBag)) return false;
  bag = nextBag;
  updateBagSummary();
  window.dispatchEvent(new CustomEvent('rafa:apparel-cart-change'));
  if (catalogStatus) catalogStatus.textContent = `${product.name} added to your bag preview. This is not a real order.`;
  return true;
}

function createColorChoices(product, selectedColor, onSelect, showAll = false) {
  const colors = getColors(product);
  const group = document.createElement('div');
  group.className = 'product-colors';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${product.name} colour preview`);
  const visibleColors = showAll ? colors : colors.slice(0, 3);
  visibleColors.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'product-swatch';
    swatch.style.setProperty('--swatch-color', color.value);
    swatch.setAttribute('aria-label', `${color.name}${selectedColor === color.name ? ', selected' : ''}`);
    swatch.setAttribute('aria-pressed', String(selectedColor === color.name));
    swatch.title = color.name;
    swatch.addEventListener('click', () => onSelect(color.name));
    group.append(swatch);
  });
  if (colors.length > visibleColors.length) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'product-colors-more';
    more.textContent = `+${colors.length - visibleColors.length}`;
    more.setAttribute('aria-label', `View all ${colors.length} colour options for ${product.name}`);
    more.addEventListener('click', () => openQuickView(product, products.indexOf(product), selectedColor));
    group.append(more);
  }
  return group;
}

function createSizeSelect(product, selectedSize = '') {
  const sizes = getSizes(product);
  const select = document.createElement('select');
  select.className = 'product-variant';
  select.setAttribute('aria-label', `${product.name} size preview`);
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = sizes.length ? 'Choose size' : 'One size';
  select.append(prompt);
  sizes.forEach((entry) => {
    const option = document.createElement('option');
    const size = typeof entry === 'string' ? entry : entry.value;
    option.value = size;
    option.textContent = typeof entry === 'string' ? entry : entry.label || size;
    option.disabled = typeof entry === 'object' && entry.available === false;
    select.append(option);
  });
  if (!sizes.length) {
    prompt.value = 'One size';
    prompt.selected = true;
  } else {
    select.value = selectedSize;
  }
  return select;
}

function openQuickView(product, productIndex, selectedColor = '') {
  if (!quickView || !quickViewContent) return;
  activeQuickView = {
    product,
    productIndex,
    color: selectedColor || getColors(product)[0]?.name || '',
    size: ''
  };
  quickViewImageIndex = 0;
  renderQuickView();
  quickView.showModal();
}

function renderQuickView() {
  if (!activeQuickView || !quickViewContent) return;
  const { product, productIndex, color } = activeQuickView;
  const images = getProductImages(product, productIndex, color);
  const panel = document.createElement('div');
  panel.className = 'quick-view-layout';

  const media = document.createElement('div');
  media.className = 'quick-view-media';
  const image = document.createElement('img');
  image.alt = getImageAlt(product, color);
  image.loading = 'eager';
  image.decoding = 'async';
  setImageSource(image, images[quickViewImageIndex]);
  image.addEventListener('error', () => {
    media.classList.add('image-unavailable');
    image.removeAttribute('src');
  });
  image.addEventListener('load', () => media.classList.remove('image-unavailable'));
  media.append(image);
  if (images.length > 1) {
    const galleryControls = document.createElement('div');
    galleryControls.className = 'quick-view-gallery';
    images.forEach((_, index) => {
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.className = 'quick-view-gallery-item';
      preview.setAttribute('aria-label', `Show product image ${index + 1}`);
      preview.setAttribute('aria-pressed', String(index === quickViewImageIndex));
      const thumbnail = document.createElement('img');
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      setImageSource(thumbnail, images[index]);
      preview.append(thumbnail);
      preview.addEventListener('click', () => {
        quickViewImageIndex = index;
        renderQuickView();
      });
      galleryControls.append(preview);
    });
    media.append(galleryControls);
  }

  const details = document.createElement('div');
  details.className = 'quick-view-details';
  const category = document.createElement('p');
  category.className = 'eyebrow';
  category.textContent = product.category || 'Apparel';
  const title = document.createElement('h2');
  title.id = 'productQuickViewTitle';
  title.textContent = product.name;
  const price = document.createElement('p');
  price.className = 'quick-view-price';
  price.textContent = formatPrice(product.price);
  const description = document.createElement('p');
  description.className = 'quick-view-description';
  description.textContent = product.description || 'Product details are available on request.';
  const previewNote = document.createElement('p');
  previewNote.className = 'quick-view-note';
  previewNote.textContent = 'Preview options only. Colour, size availability, and stock are not verified.';
  details.append(category, title, price, description, previewNote);

  const colors = getColors(product);
  if (colors.length) {
    const colorLabel = document.createElement('p');
    colorLabel.className = 'quick-view-label';
    colorLabel.textContent = `Colour: ${color}`;
    const colorGroup = createColorChoices(product, color, (nextColor) => {
      activeQuickView.color = nextColor;
      quickViewImageIndex = 0;
      renderQuickView();
    }, true);
    details.append(colorLabel, colorGroup);
  }

  const sizeSelect = createSizeSelect(product, activeQuickView.size);
  sizeSelect.addEventListener('change', () => { activeQuickView.size = sizeSelect.value; });
  const sizeLabel = document.createElement('label');
  sizeLabel.className = 'quick-view-label';
  sizeLabel.textContent = getSizes(product).length ? 'Choose size' : 'Item option';
  sizeLabel.append(sizeSelect);
  details.append(sizeLabel);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'quick-view-add';
  addButton.textContent = 'Add to bag preview';
  addButton.addEventListener('click', () => {
    const selectedSize = activeQuickView.size || sizeSelect.value;
    if (!selectedSize) {
      sizeSelect.focus();
      if (catalogStatus) catalogStatus.textContent = `Choose a size for ${product.name} first.`;
      return;
    }
    if (addPreviewItem(product, selectedSize, activeQuickView.color || 'One colour')) quickView.close();
  });
  const contactLink = document.createElement('a');
  contactLink.href = 'contact.html?topic=apparels';
  contactLink.className = 'quick-view-contact';
  contactLink.textContent = 'Ask RAFA about this style';
  details.append(addButton, contactLink);
  panel.append(media, details);
  quickViewContent.replaceChildren(panel);
}
categoryButtons.forEach((button) => {
  const count = button.querySelector('small');
  if (!count) return;
  const category = button.dataset.category;
  const total = category === 'all' ? products.length : products.filter((product) => product.category === category).length;
  count.textContent = `${total} ${total === 1 ? 'style' : 'styles'}`;
});

function formatPrice(value) {
  return window.RAFACurrency.format(value);
}

function renderProducts(filter = currentFilter) {
  if (!catalogGrid) return;

  currentFilter = filter;
  if (catalogStatus) catalogStatus.textContent = previewLoadError
    ? 'A saved preview list could not be loaded. You can still browse the catalogue.'
    : '';
  const visibleProducts = (filter === 'all'
    ? [...products]
    : products.filter((product) => product.category === filter))
    .sort((a, b) => {
      if (productSort?.value === 'price-low') return Number(a.price) - Number(b.price);
      if (productSort?.value === 'price-high') return Number(b.price) - Number(a.price);
      return products.indexOf(a) - products.indexOf(b);
    });

  catalogEmpty.hidden = visibleProducts.length > 0;
  catalogGrid.replaceChildren(...visibleProducts.map((product) => {
    const card = document.createElement('article');
    card.className = 'product-card';
    const media = document.createElement('div');
    media.className = 'product-media';
    const productIndex = products.indexOf(product);
    const productKey = productId(product);
    const colors = getColors(product);
    let selectedColor = colors[0]?.name || '';
    const images = getProductImages(product, productIndex, selectedColor);
    let selectedImageIndex = 0;
    const image = document.createElement('img');
    image.alt = getImageAlt(product, selectedColor);
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 700;
    image.height = 900;
    if (typeof window.RAFAMedia?.image === 'function') {
      if (images[0].includes('images.unsplash.com/')) {
        const sourceUrl = new URL(images[0]);
        const width = sourceUrl.searchParams.get('w') || '700';
        sourceUrl.searchParams.set('w', width);
        const baseUrl = sourceUrl.toString();
        image.srcset = [
          `${baseUrl.replace(`w=${width}`, 'w=420')} 420w`,
          `${baseUrl.replace(`w=${width}`, 'w=700')} 700w`,
          `${baseUrl.replace(`w=${width}`, 'w=900')} 900w`
        ].join(', ');
        image.sizes = '(max-width: 760px) 48vw, (max-width: 1100px) 33vw, 16vw';
      }
    }
    setImageSource(image, images[0]);
    image.addEventListener('error', () => {
      media.classList.add('image-unavailable');
      image.removeAttribute('src');
    });
    image.addEventListener('load', () => media.classList.remove('image-unavailable'));
    media.append(image);
    const productBadge = window.RAFAContent?.getProductBadge(product);
    if (productBadge) {
      const badge = document.createElement('span');
      badge.className = `product-badge product-badge--${productBadge.type}`;
      badge.textContent = productBadge.label;
      media.append(badge);
    }
    const favorite = document.createElement('button');
    favorite.className = 'product-favorite';
    favorite.type = 'button';
    const saved = wishlist.includes(productKey);
    favorite.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${product.name} ${saved ? 'from' : 'to'} this browser’s wishlist preview`);
    favorite.setAttribute('aria-pressed', String(saved));
    favorite.textContent = saved ? '♥' : '♡';
    media.append(favorite);
    favorite.addEventListener('click', () => {
      const adding = !wishlist.includes(productKey);
      const nextWishlist = adding
        ? [...wishlist, productKey]
        : wishlist.filter((id) => id !== productKey);
      if (!savePreviewList(wishlistKey, nextWishlist)) return;
      wishlist = nextWishlist;
      favorite.textContent = adding ? '♥' : '♡';
      favorite.setAttribute('aria-pressed', String(adding));
      favorite.setAttribute('aria-label', `${adding ? 'Remove' : 'Save'} ${product.name} ${adding ? 'from' : 'to'} this browser’s wishlist preview`);
      if (catalogStatus) catalogStatus.textContent = adding
        ? `${product.name} saved to this browser’s wishlist preview.`
        : `${product.name} removed from this browser’s wishlist preview.`;
    });

    if (images.length > 1) {
      const galleryControls = document.createElement('div');
      galleryControls.className = 'product-gallery-dots';
      galleryControls.setAttribute('role', 'group');
      galleryControls.setAttribute('aria-label', `${product.name} image preview`);
      images.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'product-gallery-dot';
        dot.setAttribute('aria-label', `Show product image ${index + 1}`);
        dot.setAttribute('aria-pressed', String(index === selectedImageIndex));
        dot.addEventListener('click', () => {
          selectedImageIndex = index;
          setImageSource(image, images[index]);
          galleryControls.querySelectorAll('button').forEach((item, dotIndex) => {
            item.setAttribute('aria-pressed', String(dotIndex === index));
          });
        });
        galleryControls.append(dot);
      });
      media.append(galleryControls);
    }

    const quickViewButton = document.createElement('button');
    quickViewButton.type = 'button';
    quickViewButton.className = 'product-quick-view-trigger';
    quickViewButton.textContent = 'Quick view';
    quickViewButton.addEventListener('click', () => openQuickView(product, productIndex, selectedColor));
    media.append(quickViewButton);

    const body = document.createElement('div');
    body.className = 'product-body';
    const top = document.createElement('div');
    top.className = 'product-top';
    const category = document.createElement('span');
    category.className = 'product-category';
    category.textContent = String(product.category || 'apparel').replaceAll('-', ' ');
    top.append(category);

    const name = document.createElement('h3');
    name.textContent = product.name;
    name.id = `product-${productKey}`;
    card.setAttribute('aria-labelledby', name.id);
    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description || '';
    const colorName = document.createElement('span');
    colorName.className = 'product-color-name';
    colorName.textContent = selectedColor ? `Colour: ${selectedColor}` : 'Colour options not listed';
    const colorChoices = createColorChoices(product, selectedColor, (nextColor) => {
      selectedColor = nextColor;
      colorName.textContent = `Colour: ${selectedColor}`;
      const colorImages = getProductImages(product, productIndex, selectedColor);
      selectedImageIndex = 0;
      setImageSource(image, colorImages[0]);
      image.alt = getImageAlt(product, selectedColor);
      const imageDots = media.querySelector('.product-gallery-dots');
      imageDots?.remove();
      if (colorImages.length > 1) {
        const dots = document.createElement('div');
        dots.className = 'product-gallery-dots';
        dots.setAttribute('role', 'group');
        dots.setAttribute('aria-label', `${product.name} ${selectedColor} image preview`);
        colorImages.forEach((_, index) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = 'product-gallery-dot';
          dot.setAttribute('aria-label', `Show ${selectedColor} image ${index + 1}`);
          dot.setAttribute('aria-pressed', String(index === 0));
          dot.addEventListener('click', () => {
            selectedImageIndex = index;
            setImageSource(image, colorImages[index]);
            dots.querySelectorAll('button').forEach((item, dotIndex) => {
              item.setAttribute('aria-pressed', String(dotIndex === index));
            });
          });
          dots.append(dot);
        });
        media.append(dots);
      }
      colorChoices.querySelectorAll('.product-swatch').forEach((button) => {
        const selected = button.title === selectedColor;
        button.setAttribute('aria-pressed', String(selected));
        button.setAttribute('aria-label', `${button.title}${selected ? ', selected' : ''}`);
      });
    });
    const optionNote = document.createElement('p');
    optionNote.className = 'product-option-note';
    optionNote.textContent = 'Sample options · availability not confirmed';
    const variant = createSizeSelect(product);
    const bottom = document.createElement('div');
    bottom.className = 'product-bottom';
    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = formatPrice(product.price);
    const addButton = document.createElement('button');
    addButton.className = 'product-button';
    addButton.type = 'button';
    addButton.setAttribute('aria-label', `Add ${product.name} to bag preview`);
    addButton.textContent = 'Add';
    bottom.append(price, addButton);
    body.append(top, name, description, colorName, colorChoices, optionNote, variant, bottom);
    card.append(media, body);
    addButton.addEventListener('click', () => {
      if (!variant.value) {
        if (catalogStatus) catalogStatus.textContent = `Choose a size for ${product.name} first.`;
        variant.focus();
        return;
      }
      if (addPreviewItem(product, variant.value, selectedColor || 'One colour')) {
        addButton.textContent = 'Added';
        window.setTimeout(() => { addButton.textContent = 'Add'; }, 1400);
      }
    });
    quickViewButton.setAttribute('aria-label', `Quick view ${product.name}`);
    return card;
  }));
}

function selectCategory(button) {
  const filter = button.dataset.category || 'all';
  document.querySelectorAll('.category-card').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.filter-chip').forEach((item) => {
    const selected = item.dataset.category === filter;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderProducts(filter);
  if (button.matches('.category-rail .category-card')) {
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.querySelectorAll('.category-card, .filter-chip').forEach((button) => {
  button.setAttribute('aria-pressed', String(button.classList.contains('active')));
  button.addEventListener('click', () => {
    selectCategory(button);
  });
});

document.querySelectorAll('a[data-category]').forEach((link) => {
  link.addEventListener('click', () => {
    const filter = link.dataset.category || 'all';
    document.querySelectorAll('.category-card').forEach((item) => {
      const selected = item.dataset.category === filter;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('.filter-chip').forEach((item) => {
      const selected = item.dataset.category === filter;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    renderProducts(filter);
  });
});

productSort?.addEventListener('change', () => renderProducts());
renderProducts();
updateBagSummary();

function applyRemoteCatalog(content) {
  const catalog = content['apparel.catalog'];
  if (!Array.isArray(catalog)) return;
  products = catalog;
  renderProducts();
  updateBagSummary();
}

window.addEventListener('rafa:content-updated', (event) => {
  applyRemoteCatalog(event.detail?.content || {});
});
window.RAFAPublicContent?.ready.then(applyRemoteCatalog);

document.getElementById('closeProductQuickView')?.addEventListener('click', () => quickView?.close());
quickView?.addEventListener('click', (event) => {
  if (event.target === quickView) quickView.close();
});
quickView?.addEventListener('close', () => {
  activeQuickView = null;
});

const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = newsletterForm.querySelector('input');
    if (!input) return;
    const status = document.getElementById('newsletterStatus');
    const submit = newsletterForm.querySelector('button[type="submit"]');
    if (!window.RAFAPublicContent || !status) {
      if (status) status.textContent = 'The signup service is unavailable. Your email was not saved.';
      return;
    }
    if (submit) submit.disabled = true;
    status.textContent = 'Saving your signup…';
    try {
      await window.RAFAPublicContent.subscribeNewsletter(input.value.trim());
      input.value = '';
      status.textContent = 'Thanks for signing up. Your email was saved.';
    } catch (error) {
      console.error('Unable to save newsletter signup:', error);
      status.textContent = `${error.message} Your email is still here; please try again.`;
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}
