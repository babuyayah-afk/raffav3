const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { once } = require('node:events');

const databasePath = path.join(os.tmpdir(), `rafa-contact-${crypto.randomUUID()}.db`);
process.env.DATABASE_PATH = databasePath;

const app = require('../../backend/src/app');
const db = require('../../backend/src/db');

test('deprecated contact endpoint cannot bypass the inquiry security checks', async () => {
  const server = app.listen(0);
  await once(server, 'listening');

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/contact-inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'events',
        name: 'Test Customer',
        email: 'TEST@example.com',
        phone: '',
        details: { eventType: 'Birthday', eventInterests: ['Catering'], guestCount: '40' }
      })
    });
    const result = await response.json();
    assert.equal(response.status, 410);
    assert.equal(result.error, 'endpoint_moved');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM contact_inquiries').get().count, 0);
  } finally {
    server.close();
    await once(server, 'close');
    db.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const filePath = `${databasePath}${suffix}`;
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
});
