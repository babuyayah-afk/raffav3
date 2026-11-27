const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCelebrationRequest } = require('../../backend/src/validators/celebrationRequestValidator');
const { validateContactInquiry } = require('../../backend/src/validators/contactInquiryValidator');

const now = new Date('2025-01-01T12:00:00.000Z');
const validRequest = {
	requestId: '4c4a4fd7-7022-4e84-9dd4-2e6425b85211',
	occasion: 'Birthday',
	customer: { name: 'Sample Customer', email: 'SAMPLE@example.com', phone: '+91 12345 67890' },
	event: { date: '2025-02-01', location: 'Test City', guestCount: 20, budget: '', notes: 'A sample enquiry' },
	selections: {
		arrangement: 'discuss',
		interests: ['Decor & styling'],
		cake: { kind: 'catalog', productId: 'chocolate-truffle', flavor: '', size: '', theme: '', message: '' },
		dessertIds: ['strawberry-shortcake-cupcakes']
	}
};

test('normalizes a valid celebration enquiry without accepting prices', () => {
	const result = validateCelebrationRequest({ ...validRequest, total: 1, price: 1 }, now);
	assert.deepEqual(result.errors, undefined);
	assert.equal(result.value.customer.email, 'sample@example.com');
	assert.equal(result.value.selections.cake.productId, 'chocolate-truffle');
	assert.equal(Object.hasOwn(result.value, 'total'), false);
});

test('rejects invalid occasion, past date, and unrecognized selections', () => {
	const result = validateCelebrationRequest({
		...validRequest,
		occasion: 'Unlisted service',
		event: { ...validRequest.event, date: '2024-12-31' },
		selections: {
			...validRequest.selections,
			interests: ['Invented service'],
			cake: { kind: 'catalog', productId: 'made-up-cake' }
		}
	}, now);
	assert.ok(result.errors.some((error) => error.includes('occasion')));
	assert.ok(result.errors.some((error) => error.includes('past')));
	assert.ok(result.errors.some((error) => error.includes('interests')));
	assert.ok(result.errors.some((error) => error.includes('productId')));
});

test('rejects malformed or oversized customer data', () => {
	const result = validateCelebrationRequest({
		...validRequest,
		customer: { name: 'x'.repeat(101), email: 'invalid' },
		event: { ...validRequest.event, notes: 'x'.repeat(2001) }
	}, now);
	assert.ok(result.errors.some((error) => error.includes('customer.name')));
	assert.ok(result.errors.some((error) => error.includes('customer.email')));
	assert.ok(result.errors.some((error) => error.includes('event.notes')));
});

test('normalizes a valid topic-specific contact inquiry', () => {
	const result = validateContactInquiry({
		topic: 'apparels',
		name: 'Sample Customer',
		email: 'SAMPLE@example.com',
		phone: '+1 555 123 4567',
		details: { apparelCategory: 'handbags', apparelNotes: 'Looking for a small evening bag.' }
	});

	assert.deepEqual(result.errors, undefined);
	assert.equal(result.value.email, 'sample@example.com');
	assert.equal(result.value.details.apparelCategory, 'handbags');
});

test('rejects invalid customer data and fields from another topic', () => {
	const result = validateContactInquiry({
		topic: 'events',
		name: 'x',
		email: 'invalid',
		details: { apparelCategory: 'shoes' }
	});

	assert.ok(result.errors.some((error) => error.includes('name')));
	assert.ok(result.errors.some((error) => error.includes('email')));
	assert.ok(result.errors.some((error) => error.includes('not supported')));
});

test('requires a supported event type and accepts celebration-builder interests', () => {
	const missingEventType = validateContactInquiry({
		topic: 'events',
		name: 'Sample Customer',
		email: 'sample@example.com',
		details: { eventInterests: ['Catering'] }
	});
	assert.ok(missingEventType.errors.some((error) => error.includes('eventType')));

	const validEvent = validateContactInquiry({
		topic: 'events',
		name: 'Sample Customer',
		email: 'sample@example.com',
		details: { eventType: 'Baby shower', eventInterests: ['Decor & styling', 'Catering'] }
	});
	assert.deepEqual(validEvent.errors, undefined);
	assert.deepEqual(validEvent.value.details.eventInterests, ['Decor & styling', 'Catering']);
});
