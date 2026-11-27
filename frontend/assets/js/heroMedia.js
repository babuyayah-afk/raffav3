(function () {
	const image = (id, width, description) => ({
		src: window.RAFAMedia.imageById(id, width, 85),
		description
	});
	const slidesByPage = {
		'index.html': {
			selector: '.hero-bg',
			type: 'background',
			videoKey: 'home-hero-video',
			slides: [
				image('photo-1511795409834-ef04bbd61622', 1800, 'A table set for a celebration'),
				image('photo-1578985545062-69928b1d9587', 1800, 'A layered celebration cake'),
				image('photo-1483985988355-763728e1935b', 1800, 'A fashion collection')
			]
		},
		'apparels.html': {
			selector: '.hero-image',
			type: 'image',
			slides: [
				image('photo-1539109136881-3be0616acf4b', 1400, 'Model wearing a relaxed neutral spring outfit'),
				image('photo-1483985988355-763728e1935b', 1400, 'People exploring a clothing collection'),
				image('photo-1525507119028-ed4c629a60a3', 1400, 'A polished seasonal apparel look')
			]
		},
		'desserts.html': {
			selector: '.dessert-hero-media',
			type: 'background',
			videoKey: 'desserts-video',
			slides: [
				image('photo-1578985545062-69928b1d9587', 1800, 'A layered celebration cake'),
				image('photo-1486427944299-d1955d23e34d', 1800, 'Decorated cupcakes'),
				image('photo-1499636136210-6f4ee915583e', 1800, 'Freshly baked cookies'),
				image('photo-1606313564200-e75d5e30476c', 1800, 'An assortment of dessert treats')
			]
		},
		'events.html': {
			selector: '.event-hero-image',
			type: 'background',
			videoKey: 'events-video',
			slides: [
				image('photo-1511795409834-ef04bbd61622', 1800, 'A table set for a celebration'),
				image('photo-1578985545062-69928b1d9587', 1800, 'A celebration table with a centerpiece cake')
			]
		}
	};
	const pageFile = window.location.pathname.split('/').pop() || 'index.html';
	const configuration = slidesByPage[pageFile];
	const hero = document.querySelector('.hero, .event-hero');
	const media = hero?.querySelector(configuration?.selector);
	if (!hero || !configuration || !media) return;
	if (pageFile === 'index.html' && hero.classList.contains('home-hero-slider')) return;

	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const dessertVideo = pageFile === 'desserts.html' ? hero.querySelector('.dessert-hero-video') : null;
	const video = configuration.videoKey ? (dessertVideo || document.createElement('video')) : null;
	if (video && !dessertVideo) {
		video.className = 'hero-media-video';
		video.muted = true;
		video.loop = true;
		video.autoplay = false;
		video.playsInline = true;
		video.preload = 'none';
		video.poster = configuration.slides[0].src;
		video.setAttribute('aria-hidden', 'true');
		video.tabIndex = -1;
		const source = document.createElement('source');
		source.src = window.RAFAMedia.asset(configuration.videoKey);
		source.type = 'video/mp4';
		video.append(source);
		if (configuration.type === 'image') {
			media.parentElement.insertBefore(video, media);
		} else {
			media.append(video);
		}
	} else if (video) {
		video.classList.add('hero-media-video');
	}

	const widget = document.createElement('div');
	widget.className = 'hero-media-control';
	if (pageFile !== 'desserts.html') widget.classList.add('hero-media-control--side');
	widget.setAttribute('role', 'group');
	widget.setAttribute('aria-label', video ? 'Hero video and image controls' : 'Hero image controls');

	const makeButton = (label, icon) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'hero-media-button';
		button.setAttribute('aria-label', label);
		button.title = label;
		button.innerHTML = icon;
		return button;
	};
	const icons = {
		previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
		pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM15 5h3v14h-3z"/></svg>',
		play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7z"/></svg>',
		next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
	};
	const previousButton = makeButton('Show previous image', icons.previous);
	const playbackButton = makeButton('Pause video', icons.pause);
	playbackButton.classList.add('hero-media-button--playback');
	const videoButton = video ? makeButton('Play hero video', icons.play) : null;
	const nextButton = makeButton('Show next image', icons.next);
	const count = document.createElement('span');
	count.className = 'hero-media-count';
	count.setAttribute('aria-live', 'polite');
	widget.append(previousButton, count, playbackButton);
	if (videoButton) widget.append(videoButton);
	widget.append(nextButton);
	hero.append(widget);

	let activeIndex = 0;
	let isPlaying = !reducedMotion.matches;
	let videoIsActive = false;
	let videoHasFrame = Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
	let intervalId;
	const contrastCanvas = document.createElement('canvas');
	contrastCanvas.width = 24;
	contrastCanvas.height = 24;
	const contrastContext = contrastCanvas.getContext('2d', { willReadFrequently: true });

	const updateContrast = (drawable) => {
		if (!contrastContext) {
			console.error('Unable to determine Desserts hero text contrast: canvas is unavailable.');
			return;
		}
		try {
			contrastContext.drawImage(drawable, 0, 0, contrastCanvas.width, contrastCanvas.height);
			const pixels = contrastContext.getImageData(0, 0, contrastCanvas.width / 2, contrastCanvas.height).data;
			let luminance = 0;
			let pixelCount = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				luminance += (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
				pixelCount += 1;
			}
			const average = luminance / pixelCount;
			const threshold = hero.dataset.contrast === 'dark' ? 0.58 : 0.48;
			hero.dataset.contrast = average >= threshold ? 'light' : 'dark';
		} catch (error) {
			console.error('Unable to determine Desserts hero text contrast:', error);
		}
	};

	let themeImage;
	const updateContrastFromImage = (src) => {
		if (pageFile !== 'desserts.html') return;
		const imageForTheme = new Image();
		themeImage = imageForTheme;
		imageForTheme.crossOrigin = 'anonymous';
		imageForTheme.onload = () => {
			if (themeImage === imageForTheme && !videoIsActive) updateContrast(imageForTheme);
		};
		imageForTheme.onerror = (error) => {
			console.error('Unable to load Desserts hero image for contrast detection:', error);
		};
		imageForTheme.src = src;
	};

	const sampleVideoContrast = () => {
		if (pageFile === 'desserts.html' && video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && videoIsActive) {
			updateContrast(video);
		}
	};

	const setVideoVisibility = () => {
		const showVideo = videoIsActive && videoHasFrame;
		if (video) video.classList.toggle('is-active', showVideo);
		if (dessertVideo) video.classList.toggle('is-hidden', !showVideo);
		if (configuration.type === 'image') media.style.opacity = showVideo ? '0' : '1';
		if (configuration.type === 'background') {
			const overlay = configuration.selector === '.hero-bg'
				? 'linear-gradient(90deg, rgba(15,13,10,0.64) 0%, rgba(15,13,10,0.46) 28%, rgba(15,13,10,0.2) 58%, rgba(15,13,10,0.04) 100%)'
				: configuration.selector === '.event-hero-image'
					? 'linear-gradient(90deg, rgba(20,17,15,0.64), rgba(20,17,15,0.3) 53%, rgba(20,17,15,0.04))'
					: '';
			if (videoIsActive && overlay) media.style.backgroundImage = overlay;
		}
	};

	const render = () => {
		const slide = configuration.slides[activeIndex];
		if (configuration.type === 'image') {
			media.alt = slide.description;
			if (!videoIsActive) {
				window.RAFAMedia?.prepareImage(media);
				media.src = slide.src;
			}
		} else if (!videoIsActive) {
			const overlay = configuration.selector === '.hero-bg'
				? 'linear-gradient(90deg, rgba(15,13,10,0.64) 0%, rgba(15,13,10,0.46) 28%, rgba(15,13,10,0.2) 58%, rgba(15,13,10,0.04) 100%), '
				: configuration.selector === '.event-hero-image'
					? 'linear-gradient(90deg, rgba(20,17,15,0.64), rgba(20,17,15,0.3) 53%, rgba(20,17,15,0.04)), '
					: 'linear-gradient(180deg, rgba(42,24,17,0.1), rgba(42,24,17,0.16)), ';
			media.style.backgroundImage = configuration.selector === '.dessert-hero-media'
				? `url("${slide.src}")`
				: `${overlay}url("${slide.src}")`;
		}
		if (pageFile === 'desserts.html') {
			const cakePhoto = hero.querySelector('.cake-photo');
			if (cakePhoto) {
				cakePhoto.style.backgroundImage = `linear-gradient(180deg, rgba(42,24,17,0.1), rgba(42,24,17,0.16)), url("${slide.src}")`;
			}
			if (videoIsActive) sampleVideoContrast();
			else updateContrastFromImage(slide.src);
		}
		setVideoVisibility();
		count.textContent = videoIsActive
			? 'VIDEO'
			: `${String(activeIndex + 1).padStart(2, '0')} / ${String(configuration.slides.length).padStart(2, '0')}`;
		const isMediaPlaying = videoIsActive ? !video.paused : isPlaying;
		const mediaLabel = videoIsActive ? 'video' : 'image rotation';
		if (videoButton) videoButton.hidden = videoIsActive;
		playbackButton.setAttribute('aria-label', `${isMediaPlaying ? 'Pause' : 'Play'} ${mediaLabel}`);
		playbackButton.title = isMediaPlaying ? `Pause ${mediaLabel}` : `Play ${mediaLabel}`;
		playbackButton.innerHTML = isMediaPlaying ? icons.pause : icons.play;
	};

	const stopRotation = () => {
		window.clearInterval(intervalId);
		intervalId = undefined;
	};
	const startRotation = () => {
		stopRotation();
		if (!isPlaying || videoIsActive || reducedMotion.matches || document.hidden) return;
		intervalId = window.setInterval(() => {
			activeIndex = (activeIndex + 1) % configuration.slides.length;
			render();
		}, 6000);
	};
	const showSlide = (index) => {
		if (videoIsActive && video) {
			videoIsActive = false;
			video.pause();
		}
		activeIndex = (index + configuration.slides.length) % configuration.slides.length;
		isPlaying = !reducedMotion.matches;
		render();
		startRotation();
	};
	const startVideo = () => {
		if (!video || !videoIsActive || !isPlaying || document.hidden) return;
		video.play().catch((error) => {
			if (videoIsActive && !document.hidden) {
				console.error(`Unable to play ${pageFile} hero video:`, error);
				showSlide(activeIndex);
			}
		});
	};
	const setPlaying = (playing) => {
		isPlaying = playing;
		if (videoIsActive) {
			if (playing) startVideo();
			else video.pause();
			render();
			return;
		}
		render();
		startRotation();
	};

	previousButton.addEventListener('click', () => showSlide(activeIndex - 1));
	nextButton.addEventListener('click', () => showSlide(activeIndex + 1));
	if (videoButton) {
		videoButton.addEventListener('click', () => {
			videoIsActive = true;
			isPlaying = true;
			stopRotation();
			render();
			startVideo();
		});
	}
	playbackButton.addEventListener('click', () => {
		setPlaying(!(videoIsActive && video ? !video.paused : isPlaying));
	});
	if (dessertVideo) {
		const flavorList = hero.querySelector('.flavor-list');
		flavorList?.addEventListener('click', (event) => {
			const flavorButton = event.target.closest('.flavor-row');
			if (!flavorButton || !flavorList.contains(flavorButton)) return;
			const visibleButtons = [...flavorList.querySelectorAll('.flavor-row:not([hidden])')];
			const flavorIndex = visibleButtons.indexOf(flavorButton);
			if (flavorIndex >= 0) showSlide(flavorIndex);
		});
	}
	const onVideoFrame = () => {
		videoHasFrame = true;
		setVideoVisibility();
		sampleVideoContrast();
	};
	if (video) {
		video.addEventListener('loadeddata', onVideoFrame);
		video.addEventListener('canplay', onVideoFrame);
		video.addEventListener('play', () => {
			videoHasFrame = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
			sampleVideoContrast();
			render();
		});
		video.addEventListener('pause', render);
		video.addEventListener('error', (error) => {
			if (!document.hidden && videoIsActive) {
				console.error(`Unable to load ${pageFile} hero video:`, error);
				showSlide(activeIndex);
			}
		});
	}
	if (pageFile === 'desserts.html') window.setInterval(sampleVideoContrast, 1000);
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) video?.pause();
		else {
			startRotation();
			startVideo();
		}
	});
	reducedMotion.addEventListener('change', () => {
		if (reducedMotion.matches) setPlaying(false);
		else if (videoIsActive) setPlaying(true);
		else startRotation();
	});

	render();
	if (videoIsActive) startVideo();
	else video?.pause();
})();
