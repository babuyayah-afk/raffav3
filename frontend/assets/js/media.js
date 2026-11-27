(function () {
	const images = {
		'apparel-look': 'photo-1529139574466-a303027c1d8b',
		'apparel-model': 'photo-1539109136881-3be0616acf4b',
		'apparel-people': 'photo-1483985988355-763728e1935b',
		'apparel-menswear': 'photo-1519085360753-af0119f7cbe7',
		'apparel-tops': 'photo-1525507119028-ed4c629a60a3',
		'apparel-shoes': 'photo-1560343090-f0409e92791a',
		'apparel-bag': 'photo-1584917865442-de89df76afd3',
		'apparel-accessories': 'photo-1511499767150-a48a237f0083',
		'apparel-coat': 'photo-1591047139829-d91aecb6caea',
		'apparel-sneakers': 'photo-1549298916-b41d501d3772',
		'apparel-jewelry': 'photo-1535632066927-ab7c9ab60908',
		'apparel-decor': 'photo-1601924994987-69e26d50dc26',
		'apparel-scarf': 'photo-1598554747436-c9293d6a588f',
		'apparel-outfit': 'photo-1591369822096-ffd140ec948f',
		'apparel-shoes-alt': 'photo-1514989940723-e8e51635b782',
		'event-table': 'photo-1511795409834-ef04bbd61622',
		'dessert-cake': 'photo-1578985545062-69928b1d9587',
		'dessert-cupcakes': 'photo-1486427944299-d1955d23e34d',
		'dessert-cookies': 'photo-1499636136210-6f4ee915583e',
		'dessert-assortment': 'photo-1606313564200-e75d5e30476c',
		'birthday-concept': 'photo-1530103862676-de8c9debad1d',
		'pastel-concept': 'photo-1464349095431-e9a21285b5f3',
		'wedding-concept': 'photo-1519741497674-611481863552',
		'ivory-concept': 'photo-1519225421980-715cb0215aed',
		'garden-concept': 'photo-1464366400600-7168b8af9bc3',
		'anniversary-concept': 'photo-1511988617509-a57c8a288659',
		'blush-concept': 'photo-1464207687429-7505649dae38',
		'graduation-concept': 'photo-1523580494863-6f3031224c94',
		'bright-concept': 'photo-1504196606672-aef5c9cefc92',
		'baby-shower-concept': 'photo-1519689680058-324335c77eba',
		'little-wonder-concept': 'photo-1513151233558-d860c5398176',
		'bridal-shower-concept': 'photo-1523438885200-e635ba2c371e',
		'corporate-concept': 'photo-1511578314322-379afb476865',
		'team-concept': 'photo-1511632765486-a01980e01a18',
		'children-concept': 'photo-1503454537195-1dcabb73ffb9',
		'winter-concept': 'photo-1512389142860-9c449e58a543',
		'home-interior': 'photo-1505693416388-ac5ce068fe85',
		'cake-golden': 'photo-1571115177098-24ec42ed204d',
		'cake-strawberry': 'photo-1565958011703-44f9829ba187'
	};
	const assets = {
		'desserts-video': 'assets/media/desserts-optimized.mp4',
		'events-video': 'assets/media/events-optimized.mp4',
		'events-video-two': 'assets/media/events1-optimized.mp4',
		'home-hero-video': 'assets/media/events1-optimized.mp4',
		'dessert-feature': 'assets/media/dessert-poster-optimized.jpg'
	};
	const cssImages = [
		{
			property: '--media-home-interior-w1200-q80',
			key: 'home-interior',
			width: 1200,
			quality: 80,
			selector: '.hero-bg, .photo-1, .photo-2, .photo-3, .photo-4, .photo-5, .photo-6, .photo-7'
		},
		{
			property: '--media-apparel-look-w900-q80',
			key: 'apparel-look',
			width: 900,
			quality: 80,
			selector: '.image-stack, .product-media, .campaign-card, .image-one, .image-two, .image-three'
		},
		{
			property: '--media-apparel-model-w800-q85',
			key: 'apparel-model',
			width: 800,
			quality: 85,
			selector: '.image-women'
		},
		{
			property: '--media-apparel-menswear-w800-q85',
			key: 'apparel-menswear',
			width: 800,
			quality: 85,
			selector: '.image-men'
		},
		{
			property: '--media-apparel-people-w800-q85',
			key: 'apparel-people',
			width: 800,
			quality: 85,
			selector: '.image-dresses'
		},
		{
			property: '--media-apparel-bag-w800-q85',
			key: 'apparel-bag',
			width: 800,
			quality: 85,
			selector: '.image-accessories'
		}
	];
	const imageListeners = new WeakMap();
	const backgroundLoads = new Map();

	function image(key, width = 900, quality = 85) {
		const id = images[key];
		if (!id) throw new Error(`Unknown image media key: ${key}`);
		return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=${quality}`;
	}

	function imageById(id, width = 900, quality = 85) {
		const key = Object.keys(images).find((candidate) => images[candidate] === id);
		if (!key) throw new Error(`Unknown Unsplash image ID: ${id}`);
		return image(key, width, quality);
	}

	function asset(key) {
		const path = assets[key];
		if (!path) throw new Error(`Unknown local media key: ${key}`);
		return path;
	}

	function prepareImage(element) {
		if (!(element instanceof HTMLImageElement)) return;
		const previous = imageListeners.get(element);
		if (previous) {
			element.removeEventListener('load', previous.onLoad);
			element.removeEventListener('error', previous.onError);
		}

		element.classList.remove('rafa-image-loaded', 'rafa-image-error');
		element.classList.add('rafa-image-loading');
		const finish = (state) => {
			if (imageListeners.get(element) !== listeners) return;
			element.removeEventListener('load', listeners.onLoad);
			element.removeEventListener('error', listeners.onError);
			element.classList.remove('rafa-image-loading');
			element.classList.toggle('rafa-image-error', state === 'error');
			element.classList.toggle('rafa-image-loaded', state === 'loaded');
			imageListeners.delete(element);
		};
		const listeners = {};
		listeners.onLoad = () => finish('loaded');
		listeners.onError = () => finish('error');
		imageListeners.set(element, listeners);
		element.addEventListener('load', listeners.onLoad);
		element.addEventListener('error', listeners.onError);

		queueMicrotask(() => {
			if (!element.complete) return;
			if (element.naturalWidth > 0) listeners.onLoad();
			else if (element.currentSrc || element.hasAttribute('src')) listeners.onError();
		});
	}

	function loadBackgroundImage(entry, target) {
		let state = backgroundLoads.get(entry.property);
		if (!state) {
			state = { status: 'pending', targets: new Set() };
			backgroundLoads.set(entry.property, state);
		}
		if (state.status === 'loaded' || state.status === 'failed') return;

		state.targets.add(target);
		target.classList.add('rafa-background-loading');
		if (state.status === 'loading') return;

		state.status = 'loading';
		const preload = new Image();
		preload.onload = () => {
			document.documentElement.style.setProperty(
				entry.property,
				`url("${image(entry.key, entry.width, entry.quality)}")`
			);
			state.status = 'loaded';
			state.targets.forEach((element) => element.classList.remove('rafa-background-loading'));
		};
		preload.onerror = (error) => {
			state.status = 'failed';
			state.targets.forEach((element) => element.classList.remove('rafa-background-loading'));
			console.error(`Unable to load background image "${entry.key}":`, error);
		};
		preload.src = image(entry.key, entry.width, entry.quality);
	}

	function deferBackgroundImages() {
		const targets = cssImages.flatMap((entry) => Array.from(document.querySelectorAll(entry.selector))
			.map((element) => ({ entry, element })));
		if (!targets.length) return;
		if (!('IntersectionObserver' in window)) {
			targets.forEach(({ entry, element }) => loadBackgroundImage(entry, element));
			return;
		}

		const entriesByTarget = new Map(targets.map(({ entry, element }) => [element, entry]));
		const observer = new IntersectionObserver((entries) => {
			entries.forEach((observation) => {
				if (!observation.isIntersecting) return;
				observer.unobserve(observation.target);
				loadBackgroundImage(entriesByTarget.get(observation.target), observation.target);
			});
		}, { rootMargin: '200px 0px' });
		targets.forEach(({ element }) => observer.observe(element));
	}

	function applyMedia() {
		document.querySelectorAll('img').forEach((element) => {
			if (!element.hasAttribute('loading')) element.loading = 'lazy';
			if (element.hasAttribute('src') || element.dataset.mediaId) prepareImage(element);
		});
		document.querySelectorAll('[data-media-id], [data-media-asset]').forEach((element) => {
			if (element.dataset.mediaId) {
				const width = Number(element.dataset.mediaWidth) || 900;
				const quality = Number(element.dataset.mediaQuality) || 85;
				element.src = image(element.dataset.mediaId, width, quality);
			} else {
				element.src = asset(element.dataset.mediaAsset);
			}
		});
		deferBackgroundImages();
	}

	window.RAFAMedia = Object.freeze({ image, imageById, asset, applyMedia, prepareImage });
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', applyMedia, { once: true });
	} else {
		applyMedia();
	}
})();
