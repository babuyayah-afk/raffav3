const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OCCASIONS = new Set([
	'Birthday',
	'Wedding',
	'Graduation',
	'Anniversary',
	'Baby shower',
	'Bridal shower',
	'Engagement party',
	'Corporate event',
	'Family gathering',
	'Other'
]);
const EVENT_INTERESTS = new Set([
	'Venue setup',
	'Decor & styling',
	'Seating & layout',
	'Catering',
	'Help me decide'
]);
const CAKE_IDS = new Set([
	'chocolate-truffle',
	'vanilla-bean',
	'strawberry-cloud',
	'red-velvet',
	'rainbow-funfetti-cake',
	'almond-raspberry-tier-cake',
	'lemon-elderflower-cake'
]);
const DESSERT_IDS = new Set([
	'mini-petit-fours',
	'strawberry-shortcake-cupcakes',
	'dark-chocolate-strawberries',
	'lemon-shortbread',
	'mango-yogurt-tartlets',
	'graduation-cap-cake-pops',
	'caramel-pecan-brownies',
	'blueberry-vanilla-cupcakes',
	'garden-party-dessert-box',
	'brownie-variety-box',
	'cookie-tin-assortment',
	'weekend-pastry-box',
	'macaron-gift-box',
	'mini-dessert-tasting-box',
	'chocolate-lover-box',
	'tea-time-bakehouse-box',
	'cupcake-celebration-box',
	'seasonal-treat-box',
	'office-snack-box',
	'wedding-favor-dessert-box',
	'assorted-fruit-tart-box',
	'classic-bakehouse-box'
]);

function isString(value, maxLength, allowEmpty = true) {
	return typeof value === 'string' &&
		value.length <= maxLength &&
		(allowEmpty || value.trim().length > 0);
}

function validateCelebrationRequest(body, now = new Date()) {
	const errors = [];
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return { errors: ['Request body must be a JSON object.'] };
	}

	const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
	if (!REQUEST_ID_PATTERN.test(requestId)) errors.push('requestId must be a UUID.');

	const occasion = typeof body.occasion === 'string' ? body.occasion.trim() : '';
	if (!OCCASIONS.has(occasion)) errors.push('occasion is not supported.');

	const customer = body.customer && typeof body.customer === 'object' && !Array.isArray(body.customer)
		? body.customer
		: {};
	const name = typeof customer.name === 'string' ? customer.name.trim() : '';
	if (!isString(name, 100, false)) errors.push('customer.name is required (1-100 characters).');

	const email = typeof customer.email === 'string' ? customer.email.trim() : '';
	if (!isString(email, 254, false) || !EMAIL_PATTERN.test(email)) {
		errors.push('customer.email must be a valid email address.');
	}

	let phone = null;
	if (customer.phone !== undefined && customer.phone !== null && customer.phone !== '') {
		phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
		if (!PHONE_PATTERN.test(phone)) errors.push('customer.phone must be 7-20 digits/spaces/+/-/().');
	}

	const event = body.event && typeof body.event === 'object' && !Array.isArray(body.event)
		? body.event
		: {};
	let eventDate = null;
	if (event.date) {
		if (typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
			errors.push('event.date must use YYYY-MM-DD format.');
		} else {
			const parsedDate = new Date(`${event.date}T00:00:00.000Z`);
			const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
			if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== event.date) {
				errors.push('event.date must be a valid calendar date.');
			} else if (parsedDate < today) {
				errors.push('event.date cannot be in the past.');
			} else {
				eventDate = event.date;
			}
		}
	}

	const location = event.location === undefined || event.location === null ? '' : event.location;
	if (!isString(location, 160)) errors.push('event.location must be 160 characters or fewer.');
	const guestCount = event.guestCount === '' || event.guestCount === undefined || event.guestCount === null
		? null
		: Number(event.guestCount);
	if (guestCount !== null && (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100000)) {
		errors.push('event.guestCount must be an integer between 1 and 100000.');
	}
	const budget = event.budget === undefined || event.budget === null ? '' : event.budget;
	if (!isString(budget, 100)) errors.push('event.budget must be 100 characters or fewer.');

	const selections = body.selections && typeof body.selections === 'object' && !Array.isArray(body.selections)
		? body.selections
		: {};
	const arrangement = selections.arrangement;
	if (!['none', 'discuss', 'unsure'].includes(arrangement)) {
		errors.push('selections.arrangement is not supported.');
	}
	const interests = selections.interests;
	if (!Array.isArray(interests) || interests.length > EVENT_INTERESTS.size ||
		interests.some((item) => typeof item !== 'string' || !EVENT_INTERESTS.has(item)) ||
		new Set(interests).size !== interests.length) {
		errors.push('selections.interests contains unsupported or duplicate values.');
	}

	const cake = selections.cake && typeof selections.cake === 'object' && !Array.isArray(selections.cake)
		? selections.cake
		: {};
	if (!['none', 'custom', 'catalog'].includes(cake.kind)) errors.push('selections.cake.kind is not supported.');
	let cakeSelection = { kind: cake.kind };
	if (cake.kind === 'catalog') {
		if (typeof cake.productId !== 'string' || !CAKE_IDS.has(cake.productId)) {
			errors.push('selections.cake.productId is not supported.');
		}
		cakeSelection.productId = cake.productId;
	}
	for (const key of ['flavor', 'size', 'theme', 'message']) {
		const value = cake[key] === undefined || cake[key] === null ? '' : cake[key];
		if (!isString(value, key === 'message' ? 120 : 100)) {
			errors.push(`selections.cake.${key} is too long.`);
		}
		cakeSelection[key] = typeof value === 'string' ? value.trim() : '';
	}

	const dessertIds = selections.dessertIds;
	if (!Array.isArray(dessertIds) || dessertIds.length > 8 ||
		dessertIds.some((id) => typeof id !== 'string' || !DESSERT_IDS.has(id)) ||
		new Set(dessertIds).size !== dessertIds.length) {
		errors.push('selections.dessertIds contains unsupported or duplicate values.');
	}

	const notes = event.notes === undefined || event.notes === null ? '' : event.notes;
	if (!isString(notes, 2000)) errors.push('event.notes must be 2000 characters or fewer.');

	if (errors.length) return { errors };
	return {
		value: {
			requestId,
			occasion,
			customer: { name, email: email.toLowerCase(), phone },
			event: {
				date: eventDate,
				location: location.trim(),
				guestCount,
				budget: budget.trim(),
				notes: notes.trim()
			},
			selections: {
				arrangement,
				interests,
				cake: cakeSelection,
				dessertIds
			}
		}
	};
}

module.exports = { validateCelebrationRequest };
