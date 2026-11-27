'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createShowcaseRepository } = require('../src/repositories/showcaseRepository');

class Query {
  constructor(table, respond, calls) {
    this.table = table;
    this.respond = respond;
    this.calls = calls;
  }

  record(name, args) {
    this.calls.push([this.table, name, ...args]);
    return this;
  }

  select(...args) { return this.record('select', args); }
  eq(...args) { return this.record('eq', args); }
  is(...args) { return this.record('is', args); }
  order(...args) { return this.record('order', args); }
  limit(...args) { return this.record('limit', args); }
  range(...args) { return this.record('range', args); }
  or(...args) { return this.record('or', args); }
  ilike(...args) { return this.record('ilike', args); }
  in(...args) { return this.record('in', args); }
  maybeSingle() { return this.respond(this); }
  then(resolve, reject) { return Promise.resolve(this.respond(this)).then(resolve, reject); }
}

function clientWith(respond) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) { return new Query(table, respond, calls); },
      rpc: async () => ({ data: null, error: null }),
      storage: {
        from() {
          return {
            async createSignedUrl() {
              return { data: { signedUrl: 'https://storage.example.test/signed' }, error: null };
            }
          };
        }
      }
    }
  };
}

test('public showcase queries only published visible content and never select drafts', async () => {
  const state = clientWith((query) => ({ data: [], error: null }));
  const repository = createShowcaseRepository(state.client);
  assert.deepEqual(await repository.getPublicItems('faq'), []);
  const itemQuery = state.calls.filter(([table]) => table === 'showcase_items');
  const selectedFields = itemQuery.find(([, method]) => method === 'select')[2];
  assert.equal(selectedFields.includes('draft_data'), false);
  assert.ok(itemQuery.some(([, method, ...args]) =>
    method === 'eq' && args[0] === 'status' && args[1] === 'published'));
  assert.ok(itemQuery.some(([, method, ...args]) =>
    method === 'eq' && args[0] === 'is_visible' && args[1] === true));
  assert.ok(itemQuery.some(([, method, ...args]) =>
    method === 'is' && args[0] === 'archived_at' && args[1] === null));
});

test('admin draft listing overlays unpublished edits without changing live values', async () => {
  const draftRow = {
    id: '00000000-0000-4000-8000-000000000002',
    content_type: 'faq',
    slug: 'booking',
    title: 'Live title',
    summary: '',
    body: 'Live answer',
    details: {},
    image_asset_id: null,
    status: 'published',
    is_visible: true,
    is_featured: false,
    display_order: 0,
    draft_data: {
      title: 'Draft title',
      body: 'Draft answer',
      is_visible: false
    }
  };
  const state = clientWith((query) => ({
    data: query.table === 'showcase_items' ? [draftRow] : null,
    count: 1,
    error: null
  }));
  const result = await createShowcaseRepository(state.client).listItems({
    type: 'faq',
    status: 'draft',
    search: '',
    page: 1,
    limit: 25
  });
  assert.equal(result.items[0].title, 'Draft title');
  assert.equal(result.items[0].body, 'Draft answer');
  assert.equal(result.items[0].status, 'draft');
  assert.equal(result.items[0].published_status, 'published');
  assert.equal(result.items[0].draft_data, undefined);
  assert.equal(result.total, 1);
});

test('failed media registration cleans up the uploaded object and reports cleanup failures', async () => {
  const state = clientWith(() => ({ data: null, error: null }));
  const removed = [];
  state.client.rpc = async () => ({
    data: null,
    error: { code: '42501', message: 'permission denied' }
  });
  state.client.storage.from = () => ({
    async upload() { return { data: {}, error: null }; },
    async remove(paths) {
      removed.push(...paths);
      return { data: null, error: { message: 'storage unavailable' } };
    },
    async createSignedUrls() { return { data: [], error: null }; }
  });
  const repository = createShowcaseRepository(state.client);
  await assert.rejects(() => repository.uploadAsset('actor-1', {
    fileName: '00000000-0000-4000-8000-000000000003.webp',
    buffer: Buffer.from('webp'),
    contentType: 'image/webp',
    originalName: 'image.webp'
  }, 'Alt text'), (error) => {
    assert.match(error.message, /permission denied/);
    assert.match(error.message, /storage unavailable/);
    assert.equal(error.code, undefined);
    return true;
  });
  assert.deepEqual(removed, ['00000000-0000-4000-8000-000000000003.webp']);
});
