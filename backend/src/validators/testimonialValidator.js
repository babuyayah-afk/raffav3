function validateTestimonial(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a JSON object.'] };
  }

  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80 || name.includes('\u0000')) {
    errors.push('name must be 2-80 characters and contain no invalid characters.');
  }

  const quote = typeof body.quote === 'string' ? body.quote.trim() : '';
  if (quote.length < 20 || quote.length > 1200 || quote.includes('\u0000')) {
    errors.push('quote must be 20-1200 characters and contain no invalid characters.');
  }

  const detail = typeof body.detail === 'string' ? body.detail.trim().replace(/\s+/g, ' ') : '';
  if (detail.length > 160 || detail.includes('\u0000')) {
    errors.push('detail must be 160 characters or fewer and contain no invalid characters.');
  }

  if (body.consent !== true) errors.push('consent is required to publish a testimonial.');

  if (errors.length) return { errors };
  return { value: { name, quote, detail } };
}

module.exports = { validateTestimonial };
