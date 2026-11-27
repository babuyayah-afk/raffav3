'use strict';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function createInquiryNotifier({
  repository,
  apiKey = process.env.RESEND_API_KEY || '',
  from = process.env.INQUIRY_EMAIL_FROM || '',
  fetchImpl = globalThis.fetch,
  logger = console,
  followUpDays = Number(process.env.INQUIRY_FOLLOW_UP_DAYS || 3)
}) {
  if (!repository) throw new TypeError('An inquiry repository is required.');
  let timer = null;
  let running = false;

  async function sendNotification(item) {
    if (!apiKey || !from) throw new Error('Inquiry email is not configured.');
    const inquiry = await repository.getNotificationInquiry(item.inquiry_id);
    if (!inquiry) throw new Error('The saved inquiry could not be loaded for notification.');
    const summary = [
      `Type: ${inquiry.type}`,
      `Name: ${inquiry.name}`,
      `Email: ${inquiry.email}`,
      `Phone: ${inquiry.phone || 'Not provided'}`,
      `Message: ${inquiry.message || 'No message provided'}`,
      `Reference: ${inquiry.id}`
    ].join('\n');
    const html = `<h2>New RAFA inquiry</h2><p><strong>Type:</strong> ${escapeHtml(inquiry.type)}</p><p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p><p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p><p><strong>Phone:</strong> ${escapeHtml(inquiry.phone || 'Not provided')}</p><p><strong>Message:</strong><br>${escapeHtml(inquiry.message || 'No message provided').replace(/\n/g, '<br>')}</p><p><strong>Reference:</strong> ${escapeHtml(inquiry.id)}</p>`;
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: item.recipients,
        subject: `New ${inquiry.type} inquiry from ${inquiry.name}`,
        text: summary,
        html
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 300)}`);
    }
  }

  async function processNotifications() {
    if (running) return;
    running = true;
    try {
      const due = await repository.getPendingNotifications();
      for (const item of due) {
        try {
          await sendNotification(item);
          await repository.markNotificationSent(item.id);
        } catch (error) {
          await repository.markNotificationRetry(item.id, item.attempts + 1, error);
          logger.error('Inquiry notification delivery failed; retry scheduled.', {
            inquiryId: item.inquiry_id,
            error: error.message
          });
        }
      }
    } finally {
      running = false;
    }
  }

  async function processFollowups() {
    if (!Number.isInteger(followUpDays) || followUpDays < 1 || followUpDays > 365) {
      throw new Error('INQUIRY_FOLLOW_UP_DAYS must be an integer from 1 to 365.');
    }
    const due = await repository.listDueFollowups(followUpDays);
    for (const item of due) {
      await repository.markFollowupReminder(item.id);
    }
  }

  return Object.freeze({
    async notifyInquiry() {
      await processNotifications();
    },
    async runOnce() {
      await processNotifications();
      await processFollowups();
    },
    start(intervalMs = 60_000) {
      if (timer) return;
      timer = setInterval(() => {
        this.runOnce().catch((error) =>
          logger.error('Inquiry notification worker failed.', { error: error.message })
        );
      }, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
  });
}

module.exports = { createInquiryNotifier };
