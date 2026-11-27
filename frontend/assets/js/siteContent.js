(function () {
  const collections = {
    projects: [
      { id: 'horizon-residence', name: 'Horizon Residence', detail: 'Los Angeles, CA', image: '' },
      { id: 'aurora-office-tower', name: 'Aurora Office Tower', detail: 'New York, NY', image: '' },
      { id: 'edgewood-villa', name: 'Edgewood Villa', detail: 'Austin, TX', image: '' },
      { id: 'maple-street-residences', name: 'Maple Street Residences', detail: 'Seattle, WA', image: '' }
    ],
    apparel: [
      { id: 'celine-wrap-blazer', name: 'Celine Wrap Blazer', category: 'clothes', description: 'Structured drape in a soft neutral tone for everyday polish.', price: 189, rating: 4.9, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'luna-knit-set', name: 'Luna Knit Set', category: 'clothes', description: 'A cozy matching co-ord with a relaxed silhouette and refined finish.', price: 146, rating: 4.8, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'aster-leather-sneaker', name: 'Aster Leather Sneaker', category: 'shoes', description: 'Low-profile everyday leather sneakers with cushioned soles.', price: 132, rating: 4.7, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'sloane-slingback', name: 'Sloane Slingback', category: 'shoes', description: 'A classic heel with sculpted ease and a refined pointed toe.', price: 170, rating: 4.9, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'mila-structured-tote', name: 'Mila Structured Tote', category: 'handbags', description: 'A clean carry-all designed for work, travel and city errands.', price: 214, rating: 4.8, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'sera-mini-shoulder', name: 'Sera Mini Shoulder', category: 'handbags', description: 'Compact shape, polished hardware and everyday utility.', price: 168, rating: 4.7, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'noor-gold-hoop', name: 'Noor Gold Hoop', category: 'accessories', description: 'A lightweight statement finish for easy day-to-night styling.', price: 44, rating: 4.9, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'vale-silk-scarf', name: 'Vale Silk Scarf', category: 'accessories', description: 'Add movement, color and polish with a soft silk finish.', price: 52, rating: 4.8, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'ari-cotton-shirt', name: 'Ari Cotton Shirt', category: 'clothes', description: 'Soft structure and an oversized fit for effortless layering.', price: 96, rating: 4.8, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'nora-trench-coat', name: 'Nora Trench Coat', category: 'clothes', description: 'Minimal outerwear with a clean drape and weather-ready finish.', price: 228, rating: 5, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'harlow-slide', name: 'Harlow Slide', category: 'shoes', description: 'A quiet statement sandal for warm weather and easy movement.', price: 114, rating: 4.7, image: window.RAFAMedia.image('apparel-look', 900, 80) },
      { id: 'rhea-chain-bag', name: 'Rhea Chain Bag', category: 'handbags', description: 'Glossy polish and a streamlined silhouette in a functional shape.', price: 178, rating: 4.8, image: window.RAFAMedia.image('apparel-look', 900, 80) }
    ],
    desserts: [
      { id: 'chocolate-truffle', name: 'Chocolate Truffle', description: 'Layers of moist chocolate sponge, velvety ganache and a hint of cocoa, finished with handcrafted chocolate curls.' },
      { id: 'vanilla-bean', name: 'Vanilla Bean', description: 'Soft vanilla sponge layered with smooth vanilla cream and finished with delicate bean-speckled frosting.' },
      { id: 'strawberry-cloud', name: 'Strawberry Cloud', description: 'Tender sponge, fresh strawberry filling and a light cream finish make this a bright celebratory favorite.' },
      { id: 'red-velvet', name: 'Red Velvet', description: 'A tender cocoa sponge paired with tangy cream cheese frosting for a classic, balanced slice.' }
    ]
  };

  function getCollection(name) {
    if (!Object.prototype.hasOwnProperty.call(collections, name)) {
      throw new Error(`Unknown content collection: ${name}`);
    }
    const stored = localStorage.getItem(`rafa-admin-${name}`);
    if (stored === null) {
      return collections[name].map((item) => name === 'apparel'
        ? convertApparelPrices(item, 'USD')
        : { ...item });
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error(`Saved ${name} content must be a list.`);
    const currencyKey = 'rafa-admin-apparel-currency';
    if (name === 'apparel' && localStorage.getItem(currencyKey) !== 'KES') {
      const converted = parsed.map((item) => convertApparelPrices(item, 'USD'));
      localStorage.setItem(`rafa-admin-${name}`, JSON.stringify(converted));
      localStorage.setItem(currencyKey, 'KES');
      return converted;
    }
    return parsed;
  }

  function convertApparelPrices(item, currency) {
    const converted = { ...item };
    ['price', 'compareAtPrice', 'originalPrice'].forEach((key) => {
      if (typeof converted[key] === 'number' && Number.isFinite(converted[key])) {
        converted[key] = window.RAFACurrency.convertToKES(converted[key], currency);
      }
    });
    return converted;
  }

  function saveCollection(name, items) {
    if (!Object.prototype.hasOwnProperty.call(collections, name)) {
      throw new Error(`Unknown content collection: ${name}`);
    }
    if (!Array.isArray(items)) throw new Error(`Cannot save ${name}: content must be a list.`);
    localStorage.setItem(`rafa-admin-${name}`, JSON.stringify(items));
    if (name === 'apparel') localStorage.setItem('rafa-admin-apparel-currency', 'KES');
  }

  const badgeLabels = {
    'new arrival': { label: 'New arrival', type: 'new' },
    'new-arrival': { label: 'New arrival', type: 'new' },
    new: { label: 'New arrival', type: 'new' },
    'best seller': { label: 'Best seller', type: 'popular' },
    bestseller: { label: 'Best seller', type: 'popular' },
    trending: { label: 'Trending', type: 'popular' },
    sale: { label: 'Sale', type: 'sale' },
    exclusive: { label: 'Exclusive', type: 'exclusive' },
    'limited stock': { label: 'Limited stock', type: 'availability' },
    'limited-stock': { label: 'Limited stock', type: 'availability' },
    'just restocked': { label: 'Just restocked', type: 'restocked' },
    'just-restocked': { label: 'Just restocked', type: 'restocked' },
    'pre-order': { label: 'Pre-order', type: 'preorder' },
    preorder: { label: 'Pre-order', type: 'preorder' }
  };
  const badgePriority = [
    'sale',
    'pre-order',
    'limited stock',
    'just restocked',
    'new arrival',
    'exclusive',
    'best seller',
    'trending'
  ];
  const badgeAliases = {
    'new arrival': 'new arrival',
    'new-arrival': 'new arrival',
    new: 'new arrival',
    'best seller': 'best seller',
    bestseller: 'best seller',
    trending: 'trending',
    sale: 'sale',
    exclusive: 'exclusive',
    'limited stock': 'limited stock',
    'limited-stock': 'limited stock',
    'just restocked': 'just restocked',
    'just-restocked': 'just restocked',
    'pre-order': 'pre-order',
    preorder: 'pre-order'
  };

  function getProductBadge(product) {
    if (!product || typeof product !== 'object') return null;
    const approved = new Set(
      (Array.isArray(product.badges) ? product.badges : [product.badge])
        .filter((badge) => typeof badge === 'string')
        .map((badge) => badgeAliases[badge.trim().toLowerCase()])
        .filter(Boolean)
    );
    const price = Number(product.price);
    const comparePrice = Number(product.compareAtPrice ?? product.originalPrice);
    if (Number.isFinite(price) && price >= 0 && Number.isFinite(comparePrice) && comparePrice > price) {
      approved.add('sale');
    }
    if (product.preOrder === true || product.preorder === true) approved.add('pre-order');
    if (product.limitedStock === true || ['limited', 'low-stock'].includes(product.stockStatus)) {
      approved.add('limited stock');
    }
    if (product.justRestocked === true) approved.add('just restocked');
    if (product.isNewArrival === true) approved.add('new arrival');
    if (product.isExclusive === true) approved.add('exclusive');
    if (product.isBestSeller === true) approved.add('best seller');
    if (product.isTrending === true) approved.add('trending');

    const key = badgePriority.find((badge) => approved.has(badge));
    return key ? { ...badgeLabels[key], key } : null;
  }

  window.RAFAContent = { getCollection, saveCollection, getProductBadge };
})();
