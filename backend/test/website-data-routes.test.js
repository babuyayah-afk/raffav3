'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const { createWebsiteDataRouter } = require('../src/routes/websiteDataRoutes');

const calls = [];
const repository = {
  async getPublicSiteContent() {
    return { 'home.stats': [{ value: 4 }], 'home.testimonials': [] };
  },
  async createContactInquiry(record) {
    calls.push(['createContactInquiry', record]);
    return { id: record.id, created_at: record.created_at, status: record.status };
  },
  async readEditableSiteContent() {
    return {
      rows: [{ content_key: 'home.stats', value_json: [{ value: 4 }], updated_at: '2026-01-01T00:00:00.000Z' }],
      drafts: []
    };
  },
  async saveSiteContent(key, value, updatedAt) {
    calls.push(['saveSiteContent', key, value, updatedAt]);
    return { content_key: key, value_json: value, updated_at: updatedAt };
  },
  async saveSiteContentState(actorId, key, value, status, requestId) {
    calls.push(['saveSiteContentState', actorId, key, value, status, requestId]);
    return {
      content_key: key,
      value_json: value,
      status,
      updated_at: '2026-01-01T00:00:00.000Z'
    };
  },
  async listTestimonials(status) {
    return [{ id: 'testimonial-1', status }];
  }
};
const portfolioItem = {
  id: 'portfolio-1',
  title: 'Garden wedding',
  summary: 'A garden celebration',
  details: { initials: 'G', highlights: ['240 guests'] },
  image_url: 'https://storage.example.test/garden.webp',
  image_alt: 'Garden wedding reception'
};
const showcaseRepository = {
  async getPublicItems(type) {
    return type === 'portfolio_item' ? [portfolioItem] : [];
  },
  async listSections() {
    return [
      { section_key: 'home.stats', display_order: 20, is_visible: false },
      { section_key: 'home.projects', display_order: 40, is_visible: true }
    ];
  }
};

const app = express();
app.use(express.json());
app.use(createWebsiteDataRouter({
  repository,
  showcaseRepository,
  limiters: Object.fromEntries([
    'order', 'celebration', 'contactInquiry', 'testimonial', 'newsletter', 'admin'
  ].map((key) => [key, (req, res, next) => next()])),
  requireAdmin(req, res, next) {
    if (req.get('x-admin') !== 'yes') return res.status(401).json({ error: 'unauthorized' });
    req.adminUser = { id: '00000000-0000-4000-8000-000000000001', role: req.get('x-role') || 'viewer' };
    return next();
  },
  requirePermission(permission) {
    const permissionsByRole = {
      owner: ['content.read', 'content.write', 'inquiries.read', 'inquiries.status.update'],
      manager: ['content.read', 'content.write', 'inquiries.read', 'inquiries.status.update'],
      support: ['content.read', 'inquiries.read', 'inquiries.status.update'],
      viewer: ['content.read', 'inquiries.read']
    };
    return (req, res, next) => permissionsByRole[req.adminUser?.role]?.includes(permission)
      ? next()
      : res.status(403).json({ error: 'forbidden' });
  },
  validateOrderRequest: () => [],
  editableContentKeys: new Set(['home.stats']),
  isValidContentValue: () => true,
  logger: { error() {} },
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  createId: () => 'route-test-id'
}));

let server;
let apiBase;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  apiBase = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
});

test('public content route reads through the injected Supabase repository', async () => {
  const response = await fetch(`${apiBase}/api/site-content`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
  assert.deepEqual(await response.json(), {
    content: {
      'home.testimonials': [],
      'home.portfolioItems': [portfolioItem],
      'home.projects': [{
        title: 'Garden wedding',
        subtitle: 'A garden celebration',
        image: 'https://storage.example.test/garden.webp',
        highlights: ['240 guests'],
        initials: 'G'
      }],
      'home.faq': [],
      'home.sectionVisibility': { 'home.stats': false, 'home.projects': true },
      'home.sectionOrder': ['home.projects']
    }
  });
});

test('legacy contact inquiry route is disabled so CAPTCHA cannot be bypassed', async () => {
  const response = await fetch(`${apiBase}/api/contact-inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'events',
      name: ' Guest ',
      email: 'GUEST@example.test',
      details: { eventType: 'Wedding', eventLocation: 'Nairobi' }
    })
  });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, 'endpoint_moved');
  assert.equal(calls.some(([name]) => name === 'createContactInquiry'), false);
});

test('admin content route retains authentication and role checks', async () => {
  const unauthorized = await fetch(`${apiBase}/api/admin/site-content`);
  assert.equal(unauthorized.status, 401);

  const allowed = await fetch(`${apiBase}/api/admin/site-content`, {
    headers: { 'x-admin': 'yes', 'x-role': 'support' }
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {
    content: { 'home.stats': [{ value: 4 }] },
    updatedAt: { 'home.stats': '2026-01-01T00:00:00.000Z' },
    drafts: {},
    draftUpdatedAt: {}
  });

  const denied = await fetch(`${apiBase}/api/admin/site-content`, {
    headers: { 'x-admin': 'yes', 'x-role': 'unknown' }
  });
  assert.equal(denied.status, 403);
});

test('owner can persist website content through the protected admin route', async () => {
  const value = [{ value: 12, label: 'Events delivered' }];
  const response = await fetch(`${apiBase}/api/admin/site-content/home.stats`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-role': 'owner'
    },
    body: JSON.stringify({ value })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    key: 'home.stats',
    value,
    status: 'published',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.deepEqual(calls[calls.length - 1], [
    'saveSiteContentState',
    '00000000-0000-4000-8000-000000000001',
    'home.stats',
    value,
    'published',
    null
  ]);
});

test('website content drafts are saved without publishing', async () => {
  const value = { title: 'Preview title' };
  const response = await fetch(`${apiBase}/api/admin/site-content/home.stats`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-role': 'owner'
    },
    body: JSON.stringify({ value, status: 'draft' })
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    key: 'home.stats',
    value,
    status: 'draft',
    updatedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.deepEqual(calls[calls.length - 1].slice(0, 5), [
    'saveSiteContentState',
    '00000000-0000-4000-8000-000000000001',
    'home.stats',
    value,
    'draft'
  ]);
});

test('website content rejects null characters before sending JSONB to Supabase', async () => {
  const callCount = calls.length;
  const response = await fetch(`${apiBase}/api/admin/site-content/home.stats`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-role': 'owner'
    },
    body: JSON.stringify({ value: [{ label: 'Count', value: '4\u0000' }], status: 'draft' })
  });
  assert.equal(response.status, 422);
  assert.equal(calls.length, callCount);
});
