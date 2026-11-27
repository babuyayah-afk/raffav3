'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const { createShowcaseRouter } = require('../src/routes/showcaseRoutes');

const calls = [];
const item = {
  id: '00000000-0000-4000-8000-000000000002',
  content_type: 'faq',
  slug: 'booking-window',
  title: 'When should I book?',
  summary: '',
  body: 'Book early.',
  details: {},
  status: 'draft',
  is_visible: true,
  is_featured: false,
  display_order: 0
};
const repository = {
  async listItems(query) {
    calls.push(['listItems', query]);
    return { items: [item], total: 1 };
  },
  async saveItem(actorId, value) {
    calls.push(['saveItem', actorId, value]);
    return { ...item, title: value.title, status: value.status };
  },
  async archiveItem(actorId, id) {
    calls.push(['archiveItem', actorId, id]);
    return true;
  },
  async listSections() { return []; },
  async saveSections(actorId, sections) {
    calls.push(['saveSections', actorId, sections]);
    return sections;
  },
  async listAssets(query) {
    calls.push(['listAssets', query]);
    return { items: [], total: 0 };
  },
  async uploadAsset() {
    throw new Error('Unexpected image upload');
  },
  async updateAsset() {
    throw new Error('Unexpected media update');
  }
};

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(createShowcaseRouter({
  repository,
  limiters: { admin: (req, res, next) => next() },
  requireAdmin(req, res, next) {
    if (req.get('x-admin') !== 'yes') return res.status(401).json({ error: 'unauthorized' });
    req.adminUser = {
      id: '00000000-0000-4000-8000-000000000001',
      role: req.get('x-role') || 'viewer'
    };
    return next();
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = req.adminUser?.role === 'owner'
        ? ['content.read', 'content.write', 'media.read', 'media.write']
        : req.adminUser?.role === 'viewer' ? ['content.read'] : [];
      return permissions.includes(permission)
        ? next()
        : res.status(403).json({ error: 'forbidden' });
    };
  },
  logger: { error() {} }
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

test('showcase list enforces authentication and content-read permission', async () => {
  assert.equal((await fetch(`${apiBase}/api/admin/showcase`)).status, 401);
  const allowed = await fetch(`${apiBase}/api/admin/showcase?type=faq&status=draft`, {
    headers: { 'x-admin': 'yes' }
  });
  assert.equal(allowed.status, 200);
  assert.deepEqual((await allowed.json()).items[0], item);
  assert.equal((await fetch(`${apiBase}/api/admin/showcase`, {
    headers: { 'x-admin': 'yes', 'x-role': 'unknown' }
  })).status, 403);
});

test('showcase writes validate input and require content-write permission', async () => {
  const invalid = await fetch(`${apiBase}/api/admin/showcase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes', 'x-role': 'owner' },
    body: JSON.stringify({ type: 'faq', slug: 'Bad Slug', title: 'Question', status: 'draft' })
  });
  assert.equal(invalid.status, 422);

  const forbidden = await fetch(`${apiBase}/api/admin/showcase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes' },
    body: JSON.stringify({ type: 'faq', slug: 'booking-window', title: 'Question', status: 'draft' })
  });
  assert.equal(forbidden.status, 403);

  const allowed = await fetch(`${apiBase}/api/admin/showcase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes', 'x-role': 'owner' },
    body: JSON.stringify({
      type: 'faq',
      slug: 'booking-window',
      title: 'When should I book?',
      body: 'Book early.',
      status: 'draft'
    })
  });
  assert.equal(allowed.status, 201);
  assert.equal((await allowed.json()).item.status, 'draft');
  assert.equal(calls.filter(([name]) => name === 'saveItem').length, 1);
});

test('showcase archive rejects malformed IDs before calling the repository', async () => {
  const response = await fetch(`${apiBase}/api/admin/showcase/not-a-uuid`, {
    method: 'DELETE',
    headers: { 'x-admin': 'yes', 'x-role': 'owner' }
  });
  assert.equal(response.status, 422);
  assert.equal(calls.some(([name]) => name === 'archiveItem'), false);
});
