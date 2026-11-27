'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { validateTestimonial } = require('../validators/testimonialValidator');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ORDER_REQUEST_TOTAL = 100000000;

function requestId(req) {
  const value = req.get('x-request-id');
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function containsNullCharacter(value) {
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some(containsNullCharacter);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, entry]) =>
      key.includes('\u0000') || containsNullCharacter(entry));
  }
  return false;
}

function createWebsiteDataRouter({
  repository,
  showcaseRepository,
  limiters,
  requireAdmin,
  requirePermission,
  validateOrderRequest,
  editableContentKeys,
  isValidContentValue,
  logger = console,
  now = () => new Date(),
  createId = () => crypto.randomUUID()
}) {
  if (!repository || !limiters || typeof requireAdmin !== 'function' ||
      typeof requirePermission !== 'function' || typeof validateOrderRequest !== 'function' ||
      !editableContentKeys || typeof isValidContentValue !== 'function') {
    throw new TypeError('Website data routes require a repository and API dependencies.');
  }

  const router = express.Router();

  router.post('/api/order-requests', limiters.order, async (req, res) => {
    const errors = validateOrderRequest(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'validation_failed', details: errors });
    }

    const body = req.body;
    const total = body.items.reduce((sum, item) => sum + item.qty * item.price, 0);
    if (!Number.isSafeInteger(total) || total > MAX_ORDER_REQUEST_TOTAL) {
      return res.status(400).json({
        error: 'validation_failed',
        details: ['item estimate must be a safe integer within the supported range']
      });
    }

    const createdAt = now().toISOString();
    try {
      const saved = await repository.createOrderRequest({
        id: `order-${createId()}`,
        created_at: createdAt,
        customer_name: body.customer_name.trim(),
        customer_email: body.customer_email.trim().toLowerCase(),
        customer_phone: body.customer_phone || null,
        preferred_date: body.preferred_date || null,
        notes: body.notes || null,
        items_json: body.items,
        total,
        status: 'pending'
      });
      return res.status(201).json({
        ...saved,
        total_is_estimate: true
      });
    } catch (error) {
      logger.error('Failed to insert order request:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  router.post('/api/celebration-requests', limiters.celebration, async (req, res) => {
    return res.status(410).json({
      error: 'endpoint_moved',
      message: 'Use the protected public inquiry form to contact RAFA.'
    });
  });

  router.post('/api/contact-inquiries', limiters.contactInquiry, (req, res) =>
    res.status(410).json({
      error: 'endpoint_moved',
      message: 'Use the protected public inquiry form to contact RAFA.'
    })
  );

  router.post('/api/testimonials', limiters.testimonial, async (req, res) => {
    const { errors, value } = validateTestimonial(req.body);
    if (errors) return res.status(422).json({ error: 'validation_failed', details: errors });

    const createdAt = now().toISOString();
    try {
      const saved = await repository.createTestimonial({
        id: `testimonial-${createId()}`,
        created_at: createdAt,
        customer_name: value.name,
        quote: value.quote,
        event_detail: value.detail,
        consent_at: createdAt,
        status: 'pending'
      });
      return res.status(201).json(saved);
    } catch (error) {
      logger.error('Failed to insert testimonial submission:', error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to save the testimonial.' });
    }
  });

  router.get('/api/site-content', async (req, res) => {
    try {
      const content = await repository.getPublicSiteContent();
      if (showcaseRepository) {
        const [dessertPackages, eventPackages, portfolioItems, faqs, sections] = await Promise.all([
          showcaseRepository.getPublicItems('dessert_package'),
          showcaseRepository.getPublicItems('event_package'),
          showcaseRepository.getPublicItems('portfolio_item'),
          showcaseRepository.getPublicItems('faq'),
          showcaseRepository.listSections()
        ]);
        if (dessertPackages.length) content['home.dessertPackages'] = dessertPackages;
        if (eventPackages.length) content['home.eventPackages'] = eventPackages;
        if (portfolioItems.length) {
          content['home.portfolioItems'] = portfolioItems;
          content['home.projects'] = portfolioItems.map((item) => ({
            title: item.title,
            subtitle: item.summary,
            image: item.image_url,
            highlights: Array.isArray(item.details.highlights) ? item.details.highlights : [],
            initials: item.details.initials || ''
          }));
        }
        content['home.faq'] = faqs;
        content['home.sectionVisibility'] = Object.fromEntries(
          sections.map((section) => [section.section_key, section.is_visible])
        );
        content['home.sectionOrder'] = sections
          .filter((section) => section.is_visible)
          .map((section) => section.section_key);
        const contentBySection = {
          'home.heroCards': ['home.heroCards'],
          'home.stats': ['home.stats'],
          'home.services': ['home.services'],
          'home.projects': ['home.projects', 'home.portfolioItems'],
          'home.testimonials': ['home.testimonials'],
          'home.packages': ['home.eventPackages', 'home.dessertPackages'],
          'home.faq': ['home.faq'],
          'apparel.catalog': ['apparel.catalog'],
          'apparel.newsletter': ['apparel.newsletter']
        };
        sections.filter((section) => !section.is_visible).forEach((section) => {
          (contentBySection[section.section_key] || []).forEach((key) => delete content[key]);
        });
      }
      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ content });
    } catch (error) {
      logger.error('Failed to read public site content:', error);
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  router.post('/api/newsletter-subscriptions', limiters.newsletter, async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(422).json({ error: 'validation_failed', message: 'Enter a valid email address.' });
    }
    try {
      const result = await repository.subscribeNewsletter({
        id: `newsletter-${createId()}`,
        created_at: now().toISOString(),
        email,
        status: 'active'
      });
      const status = result.duplicate ? 200 : 201;
      return res.status(status).json(result);
    } catch (error) {
      logger.error('Failed to save newsletter subscription:', error);
      return res.status(500).json({ error: 'internal_error', message: 'Unable to save the subscription.' });
    }
  });

  router.get('/api/admin/site-content', limiters.admin, requireAdmin,
    requirePermission('content.read'), async (req, res) => {
      try {
        const { rows, drafts } = await repository.readEditableSiteContent();
        return res.json({
          content: Object.fromEntries(rows.map((row) => [row.content_key, row.value_json])),
          updatedAt: Object.fromEntries(rows.map((row) => [row.content_key, row.updated_at])),
          drafts: Object.fromEntries(drafts.map((row) => [row.content_key, row.value_json])),
          draftUpdatedAt: Object.fromEntries(drafts.map((row) => [row.content_key, row.updated_at]))
        });
      } catch (error) {
        logger.error('Failed to read admin site content:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.get('/api/admin/testimonials', limiters.admin, requireAdmin,
    requirePermission('content.read'), async (req, res) => {
      const status = req.query.status === undefined ? 'pending' : req.query.status;
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(422).json({ error: 'validation_failed', message: 'Unsupported testimonial status.' });
      }
      try {
        return res.json({ items: await repository.listTestimonials(status) });
      } catch (error) {
        logger.error('Failed to read testimonial submissions:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.patch('/api/admin/testimonials/:id', limiters.admin, requireAdmin,
    requirePermission('content.write'), async (req, res) => {
      const status = req.body?.status;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(422).json({ error: 'validation_failed', message: 'Choose approve or reject.' });
      }
      const reviewedAt = now().toISOString();
      try {
        const reviewerId = Array.isArray(req.adminUser?.permissions) ? req.adminUser.id : null;
        const result = await repository.reviewTestimonial(req.params.id, status, reviewerId, reviewedAt);
        if (!result) return res.status(404).json({ error: 'not_found_or_already_reviewed' });
        return res.json({ id: req.params.id, status, reviewedAt });
      } catch (error) {
        logger.error('Failed to review testimonial submission:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.put('/api/admin/site-content/:key', limiters.admin, requireAdmin,
    requirePermission('content.write'), async (req, res) => {
      const key = req.params.key;
      const value = req.body?.value;
      const status = req.body?.status === undefined ? 'published' : req.body.status;
      const serializedValue = JSON.stringify(value);
      if (!editableContentKeys.has(key) || !isValidContentValue(key, value) ||
          typeof serializedValue !== 'string' || serializedValue.length > 50000 ||
          !['draft', 'published'].includes(status)) {
        return res.status(422).json({ error: 'validation_failed', message: 'This content is invalid or too large.' });
      }
      if (containsNullCharacter(value)) {
        return res.status(422).json({ error: 'validation_failed', message: 'Content contains an invalid character.' });
      }
      try {
        const result = await repository.saveSiteContentState(
          req.adminUser.id,
          key,
          value,
          status,
          requestId(req)
        );
        return res.json({
          key,
          value: result.value_json,
          status: result.status,
          updatedAt: result.updated_at
        });
      } catch (error) {
        logger.error(`Failed to save site content "${key}":`, error);
        return res.status(500).json({ error: 'internal_error', message: 'Unable to save site content.' });
      }
    });

  const requestRouteDefinitions = [
    { path: '/api/admin/contact-inquiries', type: 'contact-inquiries', label: 'contact inquiries' },
    { path: '/api/admin/celebration-requests', type: 'celebration-requests', label: 'event inquiries' },
    { path: '/api/admin/order-requests', type: 'order-requests', label: 'dessert orders' },
    { path: '/api/admin/newsletter-subscriptions', type: 'newsletter-subscriptions', label: 'newsletter subscriptions' }
  ];

  for (const route of requestRouteDefinitions) {
    router.get(route.path, limiters.admin, requireAdmin, requirePermission('inquiries.read'),
      async (req, res) => {
        try {
          return res.json({ items: await repository.listRequests(route.type) });
        } catch (error) {
          logger.error(`Failed to read ${route.label}:`, error);
          return res.status(500).json({ error: 'internal_error' });
        }
      });

    router.patch(`${route.path}/:id`, limiters.admin, requireAdmin,
      requirePermission('inquiries.status.update'), async (req, res) => {
        try {
          const updated = await repository.updateRequestStatus(route.type, req.params.id, req.body?.status);
          if (!updated) return res.status(404).json({ error: 'not_found_or_invalid_status' });
          return res.json({ id: req.params.id, status: updated.status });
        } catch (error) {
          logger.error(`Failed to update ${route.label}:`, error);
          return res.status(500).json({ error: 'internal_error' });
        }
      });
  }

  return router;
}

module.exports = { createWebsiteDataRouter };
