const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;
const EVENT_TYPES = new Set([
  'Birthday', 'Wedding', 'Graduation', 'Anniversary', 'Baby shower', 'Bridal shower',
  'Engagement party', 'Corporate event', 'Family gathering', 'Other'
]);
const EVENT_INTERESTS = new Set([
  'Venue setup', 'Decor & styling', 'Seating & layout', 'Catering', 'Help me decide'
]);
const TOPIC_FIELDS = {
  events: new Set(['eventType', 'eventInterests', 'eventDate', 'eventLocation', 'guestCount', 'eventBudget', 'eventNotes']),
  desserts: new Set(['dessertType', 'dessertFlavor', 'dessertSize', 'servings', 'dessertDate', 'dessertNotes']),
  apparels: new Set(['apparelCategory', 'apparelItem', 'apparelSize', 'apparelQuantity', 'apparelBudget', 'apparelNotes'])
};

function validateContactInquiry(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object.'] };
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!Object.hasOwn(TOPIC_FIELDS, topic)) errors.push('topic is not supported.');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 100) errors.push('name must be 2-100 characters.');

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.push('email must be a valid email address.');

  let phone = null;
  if (body.phone !== undefined && body.phone !== null && body.phone !== '') {
    phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!PHONE_PATTERN.test(phone)) errors.push('phone must be 7-20 digits/spaces/+/-/().');
  }

  const submittedDetails = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
    ? body.details
    : {};
  const details = {};
  if (Object.hasOwn(TOPIC_FIELDS, topic)) {
    for (const [key, value] of Object.entries(submittedDetails)) {
      if (!TOPIC_FIELDS[topic].has(key)) {
        errors.push(`details.${key} is not supported for this topic.`);
      } else if (topic === 'events' && key === 'eventType') {
        if (typeof value !== 'string' || !EVENT_TYPES.has(value)) {
          errors.push('details.eventType is required and must be a supported event type.');
        } else {
          details[key] = value;
        }
      } else if (topic === 'events' && key === 'eventInterests') {
        if (!Array.isArray(value) || value.length > EVENT_INTERESTS.size ||
          value.some((interest) => typeof interest !== 'string' || !EVENT_INTERESTS.has(interest)) ||
          new Set(value).size !== value.length) {
          errors.push('details.eventInterests contains unsupported or duplicate interests.');
        } else {
          details[key] = value;
        }
      } else if (typeof value !== 'string' || value.length > 2000) {
        errors.push(`details.${key} must be a string of 2000 characters or fewer.`);
      } else {
        details[key] = value.trim();
      }
    }
    if (topic === 'events' && !Object.hasOwn(submittedDetails, 'eventType')) {
      errors.push('details.eventType is required.');
    }
  }

  if (errors.length) return { errors };
  return { value: { topic, name, email: email.toLowerCase(), phone, details } };
}

module.exports = { validateContactInquiry };
