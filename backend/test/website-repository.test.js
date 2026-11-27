'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createWebsiteRepository } = require('../src/repositories/websiteRepository');

class FakeQuery {
  constructor(table, respond) {
    this.table = table;
    this.respond = respond;
    this.operations = [];
  }

  select(value) { this.operations.push(['select', value]); return this; }
  eq(...values) { this.operations.push(['eq', ...values]); return this; }
  neq(...values) { this.operations.push(['neq', ...values]); return this; }
  order(...values) { this.operations.push(['order', ...values]); return this; }
  limit(...values) { this.operations.push(['limit', ...values]); return this; }
  insert(...values) { this.operations.push(['insert', ...values]); return this; }
  update(...values) { this.operations.push(['update', ...values]); return this; }
  upsert(...values) { this.operations.push(['upsert', ...values]); return this; }
  single() { return this.respond(this); }
  maybeSingle() { return this.respond(this); }
  then(resolve, reject) { return Promise.resolve(this.respond(this)).then(resolve, reject); }
}

function fakeClient(respond) {
  return {
    from(table) {
      return new FakeQuery(table, respond);
    },
    async rpc(name, args) {
      return respond({ table: name, args });
    }
  };
}

test('public content merges stored sections and only requests approved testimonials', async () => {
  const queries = [];
  const repository = createWebsiteRepository(fakeClient((query) => {
    queries.push(query);
    if (query.table === 'site_content') {
      return { data: [{ content_key: 'home.stats', value_json: [{ value: 3 }] }], error: null };
    }
    return {
      data: [{ quote: 'A lovely event.', customer_name: 'Guest', event_detail: 'Wedding' }],
      error: null
    };
  }));

  const content = await repository.getPublicSiteContent();
  assert.deepEqual(content['home.stats'], [{ value: 3 }]);
  assert.deepEqual(content['home.testimonials'], [{
    quote: 'A lovely event.',
    name: 'Guest',
    detail: 'Wedding'
  }]);
  assert.ok(queries.find((query) => query.table === 'testimonials').operations
    .some((operation) => operation[0] === 'eq' && operation[1] === 'status' && operation[2] === 'approved'));
});

test('readiness verifies that the Supabase website schema is reachable', async () => {
  let queriedTable;
  const repository = createWebsiteRepository(fakeClient((query) => {
    queriedTable = query.table;
    return { data: [], error: null };
  }));

  await repository.checkConnection();
  assert.equal(queriedTable, 'site_content');
});

test('editable content reads published values and drafts separately', async () => {
  const repository = createWebsiteRepository(fakeClient((query) => ({
    data: query.table === 'site_content'
      ? [{ content_key: 'home.stats', value_json: [{ value: 4 }], updated_at: 'live-time' }]
      : [{ content_key: 'home.stats', value_json: [{ value: 5 }], updated_at: 'draft-time' }],
    error: null
  })));
  const result = await repository.readEditableSiteContent();
  assert.deepEqual(result.rows[0].value_json, [{ value: 4 }]);
  assert.deepEqual(result.drafts[0].value_json, [{ value: 5 }]);
});

test('website content state writes use the permission-checked RPC', async () => {
  let call;
  const repository = createWebsiteRepository(fakeClient((query) => {
    call = query;
    return {
      data: { content_key: 'home.stats', value_json: [{ value: 5 }], status: 'draft' },
      error: null
    };
  }));
  const result = await repository.saveSiteContentState(
    'user-1', 'home.stats', [{ value: 5 }], 'draft', 'request-1'
  );
  assert.equal(result.status, 'draft');
  assert.equal(call.table, 'save_site_content_state');
  assert.deepEqual(call.args, {
    p_actor_user_id: 'user-1',
    p_content_key: 'home.stats',
    p_value_json: [{ value: 5 }],
    p_status: 'draft',
    p_request_id: 'request-1'
  });
});

test('admin request reads use a fixed table map and normalize JSONB records', async () => {
  let queriedTable;
  const repository = createWebsiteRepository(fakeClient((query) => {
    queriedTable = query.table;
    return {
      data: [{
        id: 'contact-1',
        created_at: '2026-01-01T00:00:00Z',
        topic: 'events',
        customer_name: 'Guest',
        customer_email: 'guest@example.test',
        customer_phone: null,
        details_json: { message: 'Hello' },
        status: 'new'
      }],
      error: null
    };
  }));

  const items = await repository.listRequests('contact-inquiries');
  assert.equal(queriedTable, 'contact_inquiries');
  assert.deepEqual(items[0].details, { message: 'Hello' });
  assert.equal(items[0].name, 'Guest');
  await assert.rejects(() => repository.listRequests('unknown;drop table users'));
});

test('request status writes reject unsupported statuses before reaching Supabase', async () => {
  let called = false;
  const repository = createWebsiteRepository(fakeClient(() => {
    called = true;
    return { data: { id: 'contact-1', status: 'new' }, error: null };
  }));

  assert.equal(await repository.updateRequestStatus('contact-inquiries', 'contact-1', 'admin'), null);
  assert.equal(called, false);
  assert.deepEqual(
    await repository.updateRequestStatus('contact-inquiries', 'contact-1', 'reviewed'),
    { id: 'contact-1', status: 'new' }
  );
  assert.equal(called, true);
});

test('Supabase read errors propagate with operation context and database error code', async () => {
  const repository = createWebsiteRepository(fakeClient(() => ({
    data: null,
    error: { code: '42501', message: 'permission denied' }
  })));

  await assert.rejects(repository.listTestimonials('pending'), (error) => {
    assert.match(error.message, /Supabase list testimonials failed/);
    assert.equal(error.code, '42501');
    return true;
  });
});

test('newsletter retries return an existing subscription for unique-email conflicts', async () => {
  const repository = createWebsiteRepository(fakeClient((query) => {
    if (query.operations.some((operation) => operation[0] === 'insert')) {
      return { data: null, error: { code: '23505', message: 'duplicate key' } };
    }
    return { data: { id: 'newsletter-1' }, error: null };
  }));

  assert.deepEqual(
    await repository.subscribeNewsletter({ email: 'guest@example.test' }),
    { id: 'newsletter-1', status: 'active', duplicate: true }
  );
});
