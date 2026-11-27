'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const sharp = require('sharp');
const { createInquiryRouter } = require('../src/routes/inquiryRoutes');
const { validateInquirySubmission } = require('../src/validators/inquiryValidator');

const calls = [];
const logs = [];
let captchaPasses = true;
const repository = {
  async createInquiry(record) {
    calls.push(['createInquiry', record]);
    return { id: record.id, status: 'new', created_at: '2026-11-23T00:00:00.000Z' };
  },
  async listInquiries(filters) {
    calls.push(['listInquiries', filters]);
    return { items: [], total: 0, unread: 2 };
  },
  async listAssignees() { return []; },
  async listReplyTemplates() { return []; },
  async getInquiry(id) { return { id, activity: [], attachments: [] }; },
  async updateInquiry(record) {
    calls.push(['updateInquiry', record]);
    return { id: record.inquiryId, status: record.status || 'new' };
  },
  async addNote(record) {
    calls.push(['addNote', record]);
    return { id: 1, content: record.note };
  }
};

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(createInquiryRouter({
  repository,
  limiters: {
    publicInquiry: (req, res, next) => next(),
    admin: (req, res, next) => next()
  },
  requireAdmin(req, res, next) {
    if (req.get('x-admin') !== 'yes') return res.status(401).json({ error: 'unauthorized' });
    req.adminUser = {
      id: '5f1c0c47-319e-4e51-8ea4-16a6e455aeb9',
      role: 'support',
      permissions: req.get('x-role') === 'no-assign' ? [
        'inquiries.read', 'inquiries.status.update', 'inquiries.notes.write'
      ] : [
        'inquiries.read', 'inquiries.status.update', 'inquiries.assign', 'inquiries.notes.write'
      ]
    };
    return next();
  },
  requirePermission(permission) {
    return (req, res, next) => req.adminUser?.permissions.includes(permission)
      ? next()
      : res.status(403).json({ error: 'forbidden' });
  },
  turnstileSecret: 'test-secret',
  turnstileSiteKey: 'test-site',
  verifyCaptcha: async () => captchaPasses,
  notifier: { notifyInquiry: async () => { throw new Error('mail unavailable'); } },
  uploadImage: async (storagePath, image) => calls.push(['uploadImage', storagePath, image]),
  removeImages: async (paths) => calls.push(['removeImages', paths]),
  logger: {
    warn(message) { logs.push(['warn', message]); },
    error(message) { logs.push(['error', message]); }
  },
  now: () => new Date('2026-11-23T00:00:00.000Z'),
  createId: () => '6f15f564-2dc3-41c5-a34f-21ed974a6688'
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

test('public inquiry saves normalized customer data and keeps notification failure non-blocking', async () => {
  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5500' },
    body: JSON.stringify({
      type: 'events',
      name: ' Guest ',
      email: 'GUEST@example.test',
      phone: '+254 700 000 000',
      message: '<img src=x onerror=alert(1)>',
      details: { eventType: 'Birthday' },
      website: '',
      captchaToken: 'validated-token'
    })
  });
  const result = await response.json();
  const saved = calls.findLast(([name]) => name === 'createInquiry')?.[1];

  assert.equal(response.status, 201);
  assert.equal(result.data.status, 'new');
  assert.equal(saved.name, 'Guest');
  assert.equal(saved.email, 'guest@example.test');
  assert.equal(saved.message, '<img src=x onerror=alert(1)>');
  assert.deepEqual(saved.details, { eventType: 'Birthday' });
  assert.ok(logs.some(([level, message]) =>
    level === 'error' && message.includes('immediately')));
});

test('public inquiry requires a non-empty message', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  for (const message of [undefined, '', '   ']) {
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        name: 'General Customer',
        email: 'general@example.test',
        message,
        captchaToken: 'validated-token'
      })
    });
    const result = await response.json();
    assert.equal(response.status, 422);
    assert.ok(result.details.some((issue) => issue.startsWith('message:')));
  }
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);
});

test('public inquiry image inputs enforce count, type, and total source size', () => {
  const base = {
    type: 'general',
    name: 'Image Customer',
    email: 'image@example.test',
    message: 'Please review these reference images.',
    captchaToken: 'validated-token'
  };
  const image = { name: 'reference.png', data: 'data:image/png;base64,AAAA' };
  const oversizedData = `data:image/png;base64,${'A'.repeat(2_400_000)}`;
  const oversizedSingleImageData = `data:image/png;base64,${'A'.repeat(2_800_000)}`;
  const invalidCases = [
    { referenceImages: Array(4).fill(image) },
    { referenceImages: [{ name: 'unsupported.gif', data: 'data:image/gif;base64,AAAA' }] },
    { referenceImages: [{ name: 'too-large.png', data: oversizedSingleImageData }] },
    {
      referenceImages: Array.from({ length: 3 }, (_, index) => ({
        name: `reference-${index}.png`,
        data: oversizedData
      }))
    }
  ];

  for (const inquiry of invalidCases) {
    const result = validateInquirySubmission({ ...base, ...inquiry });
    assert.ok(result.errors?.some((issue) => issue.startsWith('referenceImages')));
  }
});

test('processed reference images exceeding the storage total are rejected before upload', async () => {
  const storageApp = express();
  storageApp.use(express.json({ limit: '8mb' }));
  const uploaded = [];
  let saved = false;
  storageApp.use(createInquiryRouter({
    repository: {
      async createInquiry() {
        saved = true;
        return { id: 'test-id', status: 'new', created_at: '2026-11-23T00:00:00.000Z' };
      }
    },
    limiters: {
      publicInquiry: (req, res, next) => next(),
      admin: (req, res, next) => next()
    },
    requireAdmin: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
    turnstileSecret: 'test-secret',
    verifyCaptcha: async () => true,
    normalizeImage: async (image) => ({
      buffer: Buffer.alloc(image.name.startsWith('limit-2') ? 1024 * 1024 : 2 * 1024 * 1024),
      contentType: 'image/webp',
      originalName: image.name
    }),
    uploadImage: async (...args) => uploaded.push(args),
    logger: { warn() {}, error() {} }
  }));
  const storageServer = storageApp.listen(0, '127.0.0.1');
  await new Promise((resolve) => storageServer.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${storageServer.address().port}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        name: 'Image Customer',
        email: 'image@example.test',
        message: 'Please review these reference images.',
        captchaToken: 'validated-token',
        referenceImages: Array.from({ length: 3 }, (_, index) => ({
          name: `reference-${index}.png`,
          data: 'data:image/png;base64,AAAA'
        }))
      })
    });

    assert.equal(response.status, 422);
    assert.ok((await response.json()).details.some((issue) =>
      issue.includes('Processed images must total 5 MB or less.')));
    assert.equal(uploaded.length, 0);
    assert.equal(saved, false);

    const boundaryResponse = await fetch(`http://127.0.0.1:${storageServer.address().port}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        name: 'Image Customer',
        email: 'image@example.test',
        message: 'Please review these reference images.',
        captchaToken: 'validated-token',
        referenceImages: Array.from({ length: 3 }, (_, index) => ({
          name: `limit-${index}.png`,
          data: 'data:image/png;base64,AAAA'
        }))
      })
    });

    assert.equal(boundaryResponse.status, 201);
    assert.equal(uploaded.length, 3);
    assert.equal(saved, true);
  } finally {
    await new Promise((resolve, reject) =>
      storageServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('invalid or MIME-mismatched reference image content is rejected before upload', async () => {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: '#ff8000' }
  }).png().toBuffer();
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  const beforeUploads = calls.filter(([name]) => name === 'uploadImage').length;
  const imageData = [
    'data:image/png;base64,AAAA',
    `data:image/jpeg;base64,${png.toString('base64')}`
  ];

  for (const data of imageData) {
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        name: 'Image Customer',
        email: 'image@example.test',
        message: 'Please review this reference image.',
        captchaToken: 'validated-token',
        referenceImages: [{ name: 'reference.png', data }]
      })
    });

    assert.equal(response.status, 422);
    assert.ok((await response.json()).details.some((issue) =>
      issue.startsWith('referenceImages:')));
  }
  assert.equal(calls.filter(([name]) => name === 'uploadImage').length, beforeUploads);
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);
});

test('other event inquiries require and retain a short event description', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  for (const details of [
    { eventType: 'Other' },
    { eventType: 'Other', eventTypeOther: 'a'.repeat(101) }
  ]) {
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'events',
        name: 'Event Customer',
        email: 'event@example.test',
        message: 'Please help me plan this event.',
        details,
        captchaToken: 'validated-token'
      })
    });
    const result = await response.json();
    assert.equal(response.status, 422);
    assert.ok(result.details.some((issue) => issue.startsWith('details.eventTypeOther:')));
  }
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);

  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'events',
      name: 'Event Customer',
      email: 'event@example.test',
      message: 'Please help me plan this event.',
      details: { eventType: 'Other', eventTypeOther: 'Retirement celebration' },
      captchaToken: 'validated-token'
    })
  });
  const saved = calls.findLast(([name]) => name === 'createInquiry')?.[1];

  assert.equal(response.status, 201);
  assert.deepEqual(saved.details, {
    eventType: 'Other',
    eventTypeOther: 'Retirement celebration'
  });
});

test('other dessert inquiries require and retain a short dessert description', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  const invalid = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'desserts',
      name: 'Dessert Customer',
      email: 'dessert@example.test',
      message: 'I need a custom dessert.',
      details: { dessertType: 'Other desserts' },
      captchaToken: 'validated-token'
    })
  });
  const invalidResult = await invalid.json();
  assert.equal(invalid.status, 422);
  assert.ok(invalidResult.details.some((issue) => issue.startsWith('details.dessertTypeOther:')));
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);

  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'desserts',
      name: 'Dessert Customer',
      email: 'dessert@example.test',
      message: 'I need a custom dessert.',
      details: {
        dessertType: 'Other desserts',
        dessertTypeOther: 'Custom dessert jars'
      },
      captchaToken: 'validated-token'
    })
  });
  const saved = calls.findLast(([name]) => name === 'createInquiry')?.[1];

  assert.equal(response.status, 201);
  assert.deepEqual(saved.details, {
    dessertType: 'Other desserts',
    dessertTypeOther: 'Custom dessert jars'
  });
});

test('other apparel inquiries require and retain a short category description', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  const invalid = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'apparels',
      name: 'Apparel Customer',
      email: 'apparel@example.test',
      message: 'I am looking for custom apparel.',
      details: { apparelCategory: 'Other' },
      captchaToken: 'validated-token'
    })
  });
  const invalidResult = await invalid.json();
  assert.equal(invalid.status, 422);
  assert.ok(invalidResult.details.some((issue) => issue.startsWith('details.apparelCategoryOther:')));
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);

  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'apparels',
      name: 'Apparel Customer',
      email: 'apparel@example.test',
      message: 'I am looking for custom apparel.',
      details: {
        apparelCategory: 'Other',
        apparelCategoryOther: 'Formal wear'
      },
      captchaToken: 'validated-token'
    })
  });
  const saved = calls.findLast(([name]) => name === 'createInquiry')?.[1];

  assert.equal(response.status, 201);
  assert.deepEqual(saved.details, {
    apparelCategory: 'Other',
    apparelCategoryOther: 'Formal wear'
  });
});

test('public inquiry field values and detail keys use the allowed options', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  const invalidCases = [
    {
      type: 'events',
      name: '<script>',
      details: { eventType: 'Birthday' }
    },
    {
      type: 'events',
      name: 'Event Customer',
      details: { eventType: 'Unlisted event' }
    },
    {
      type: 'general',
      name: 'General Customer',
      details: { eventType: 'Birthday' }
    }
  ];

  for (const inquiry of invalidCases) {
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...inquiry,
        email: 'validation@example.test',
        message: 'Please help with my inquiry.',
        captchaToken: 'validated-token'
      })
    });
    assert.equal(response.status, 422);
  }
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);
});

test('honeypot submissions are rejected and logged without reaching storage', async () => {
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'general',
      name: 'Spam bot',
      email: 'bot@example.test',
      message: 'I have a question.',
      website: 'filled by bot',
      captchaToken: 'token'
    })
  });
  assert.equal(response.status, 422);
  assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);
  assert.ok(logs.some(([level, message]) => level === 'warn' && message.includes('honeypot')));
});

test('failed CAPTCHA rejects the submission before storage', async () => {
  captchaPasses = false;
  const beforeCount = calls.filter(([name]) => name === 'createInquiry').length;
  try {
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        name: 'Human Customer',
        email: 'human@example.test',
        message: 'Please help with my inquiry.',
        captchaToken: 'invalid-token'
      })
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, 'captcha_failed');
    assert.equal(calls.filter(([name]) => name === 'createInquiry').length, beforeCount);
  } finally {
    captchaPasses = true;
  }
});

test('reference images are decoded, re-encoded as WebP, and stored with random paths', async () => {
  const image = await sharp({
    create: { width: 12, height: 8, channels: 3, background: '#ff8000' }
  }).png().toBuffer();
  const response = await fetch(`${apiBase}/public/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'desserts',
      name: 'Image Guest',
      email: 'image@example.test',
      message: 'I would like to order a cake.',
      details: { dessertType: 'Celebration cake' },
      captchaToken: 'token',
      referenceImages: [{
        name: '../../reference.png',
        data: `data:image/png;base64,${image.toString('base64')}`
      }]
    })
  });
  const result = await response.json();
  const upload = calls.findLast(([name]) => name === 'uploadImage');
  const saved = calls.findLast(([name]) => name === 'createInquiry')?.[1];

  assert.equal(response.status, 201);
  assert.ok(result.data.id);
  assert.match(upload[1], /^\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.webp$/);
  assert.equal(upload[2].contentType, 'image/webp');
  assert.deepEqual(saved.attachments[0].content_type, 'image/webp');
});

test('admin inquiry listing validates filters and returns unread metadata', async () => {
  const response = await fetch(`${apiBase}/api/admin/inquiries?page=1&limit=10&type=events`, {
    headers: { 'x-admin': 'yes' }
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.meta.unread, 2);
  assert.equal(calls.findLast(([name]) => name === 'listInquiries')[1].type, 'events');

  const invalid = await fetch(`${apiBase}/api/admin/inquiries?status=unknown`, {
    headers: { 'x-admin': 'yes' }
  });
  assert.equal(invalid.status, 422);
});

test('lost and declined transitions require reasons before calling the repository', async () => {
  const response = await fetch(`${apiBase}/api/admin/inquiries/6f15f564-2dc3-41c5-a34f-21ed974a6688`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes' },
    body: JSON.stringify({ status: 'lost' })
  });
  assert.equal(response.status, 422);
  assert.equal(calls.filter(([name]) => name === 'updateInquiry').length, 0);
});

test('inquiry assignment is denied when the user has no assignment permission', async () => {
  const response = await fetch(`${apiBase}/api/admin/inquiries/6f15f564-2dc3-41c5-a34f-21ed974a6688`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-role': 'no-assign'
    },
    body: JSON.stringify({ assigneeId: null })
  });
  assert.equal(response.status, 403);
  assert.equal(calls.filter(([name]) => name === 'updateInquiry').length, 0);
});

test('status changes and internal notes use authenticated actor identity', async () => {
  const id = '6f15f564-2dc3-41c5-a34f-21ed974a6688';
  const statusResponse = await fetch(`${apiBase}/api/admin/inquiries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes' },
    body: JSON.stringify({ status: 'lost', reason: 'Customer cancelled' })
  });
  const noteResponse = await fetch(`${apiBase}/api/admin/inquiries/${id}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin': 'yes' },
    body: JSON.stringify({ note: 'Follow up next week.' })
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(noteResponse.status, 201);
  assert.equal(calls.findLast(([name]) => name === 'updateInquiry')[1].actorId,
    '5f1c0c47-319e-4e51-8ea4-16a6e455aeb9');
  assert.equal(calls.findLast(([name]) => name === 'addNote')[1].note, 'Follow up next week.');
});
