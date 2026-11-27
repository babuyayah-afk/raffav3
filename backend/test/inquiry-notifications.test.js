'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createInquiryNotifier } = require('../src/services/inquiryNotifications');

test('email failures stay queued and receive a retry with an incremented attempt count', async () => {
  const retries = [];
  const errors = [];
  const notifier = createInquiryNotifier({
    repository: {
      async getPendingNotifications() {
        return [{ id: 8, inquiry_id: 'inquiry-1', recipients: ['team@example.test'], attempts: 0 }];
      },
      async getNotificationInquiry() {
        return { id: 'inquiry-1', type: 'events', name: 'Guest', email: 'guest@example.test' };
      },
      async markNotificationRetry(...args) { retries.push(args); },
      async markNotificationSent() { assert.fail('Failed delivery must not be marked as sent.'); }
    },
    apiKey: '',
    from: '',
    logger: { error(...args) { errors.push(args); } }
  });

  await notifier.notifyInquiry();
  assert.equal(retries.length, 1);
  assert.equal(retries[0][0], 8);
  assert.equal(retries[0][1], 1);
  assert.match(retries[0][2].message, /not configured/);
  assert.equal(errors.length, 1);
});

test('successful email delivery marks the persisted notification as sent', async () => {
  let payload;
  const sent = [];
  const notifier = createInquiryNotifier({
    repository: {
      async getPendingNotifications() {
        return [{ id: 9, inquiry_id: 'inquiry-2', recipients: ['team@example.test'], attempts: 0 }];
      },
      async getNotificationInquiry() {
        return {
          id: 'inquiry-2',
          type: 'general',
          name: '<Taylor>',
          email: 'taylor@example.test',
          message: '<script>alert(1)</script>'
        };
      },
      async markNotificationSent(id) { sent.push(id); },
      async markNotificationRetry() { assert.fail('Successful delivery must not be retried.'); }
    },
    apiKey: 'test-key',
    from: 'RAFA <inquiries@example.test>',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      payload = JSON.parse(options.body);
      return { ok: true, status: 200 };
    },
    logger: { error() {} }
  });

  await notifier.notifyInquiry();
  assert.deepEqual(sent, [9]);
  assert.match(payload.html, /&lt;Taylor&gt;/);
  assert.match(payload.html, /&lt;script&gt;/);
});

test('follow-up reminders honor the configured number of inactive days', async () => {
  const calls = [];
  const notifier = createInquiryNotifier({
    repository: {
      async getPendingNotifications() { return []; },
      async listDueFollowups(days) {
        calls.push(['list', days]);
        return [{ id: 'inquiry-3' }];
      },
      async markFollowupReminder(id) { calls.push(['mark', id]); }
    },
    followUpDays: 4,
    logger: { error() {} }
  });

  await notifier.runOnce();
  assert.deepEqual(calls, [['list', 4], ['mark', 'inquiry-3']]);
});
