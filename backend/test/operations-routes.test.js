'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const { after, before, test } = require('node:test');
const { createOperationsRouter } = require('../src/routes/operationsRoutes');

const actorId = '5f1c0c47-319e-4e51-8ea4-16a6e455aeb9';
const customerId = '6f15f564-2dc3-41c5-a34f-21ed974a6688';
const bookingId = '7f15f564-2dc3-41c5-a34f-21ed974a6688';
const calls = [];
let createBookingResult;
const repository = {
  async listCustomers(filters) {
    calls.push(['listCustomers', filters]);
    return { items: [], total: 0 };
  },
  async createBooking(id, booking, requestId) {
    calls.push(['createBooking', id, booking, requestId]);
    return createBookingResult;
  },
  async getBooking(id) {
    calls.push(['getBooking', id]);
    return { id };
  },
  async getSummary() {
    return {
      newInquiries: 3,
      quotesAwaitingReply: 4,
      upcomingBookings: 5,
      balancesDueMinor: 600
    };
  }
};

const app = express();
app.use(express.json());
app.use(createOperationsRouter({
  repository,
  limiters: { admin: (req, res, next) => next() },
  requireAdmin(req, res, next) {
    if (req.get('x-admin') !== 'yes') return res.status(401).json({ error: 'unauthorized' });
    req.adminUser = {
      id: actorId,
      permissions: (req.get('x-permissions') || '').split(',').filter(Boolean)
    };
    return next();
  },
  requirePermission(permission) {
    return (req, res, next) => req.adminUser.permissions.includes(permission)
      ? next()
      : res.status(403).json({ error: 'forbidden' });
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

test('customer list requires the matching read permission', async () => {
  calls.length = 0;
  const response = await fetch(`${apiBase}/api/admin/customers`, {
    headers: { 'x-admin': 'yes', 'x-permissions': 'quotes.read' }
  });

  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('invalid same-day booking time range reports the end-time field', async () => {
  calls.length = 0;
  const response = await fetch(`${apiBase}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-permissions': 'bookings.write'
    },
    body: JSON.stringify({
      customerId,
      serviceType: 'events',
      bookingDate: '2026-12-01',
      startTime: '12:00',
      endTime: '00:00',
      venueAddress: '',
      packageName: 'Celebration',
      agreedPriceMinor: 250000,
      status: 'confirmed',
      notes: ''
    })
  });
  const result = await response.json();

  assert.equal(response.status, 422);
  assert.equal(result.error.code, 'validation_failed');
  assert.deepEqual(result.details, [{
    field: 'endTime',
    message: 'Choose a time later than the start time on the selected date. Overnight bookings are not supported.'
  }]);
  assert.equal(calls.filter(([name]) => name === 'createBooking').length, 0);
});

test('out-of-range booking clock values report the invalid time field', async () => {
  const cases = [
    { startTime: '24:00', endTime: '23:00', field: 'startTime' },
    { startTime: '10:00', endTime: '12:60', field: 'endTime' },
    { startTime: '10:00', endTime: '99:99', field: 'endTime' }
  ];

  for (const { startTime, endTime, field } of cases) {
    calls.length = 0;
    const response = await fetch(`${apiBase}/api/admin/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin': 'yes',
        'x-permissions': 'bookings.write'
      },
      body: JSON.stringify({
        customerId,
        serviceType: 'events',
        bookingDate: '2026-12-01',
        startTime,
        endTime,
        venueAddress: '',
        packageName: 'Celebration',
        agreedPriceMinor: 250000,
        status: 'confirmed',
        notes: ''
      })
    });
    const result = await response.json();

    assert.equal(response.status, 422);
    assert.deepEqual(result.details, [{
      field,
      message: 'Enter a valid time between 00:00 and 23:59.'
    }]);
    assert.equal(calls.filter(([name]) => name === 'createBooking').length, 0);
  }
});

test('booking conflicts require a reason and a retry is audited through the repository', async () => {
  calls.length = 0;
  createBookingResult = {
    requiresOverride: true,
    conflicts: { eventConflicts: [{ id: bookingId }] }
  };
  const booking = {
    customerId,
    serviceType: 'events',
    bookingDate: '2026-12-01',
    startTime: '10:00',
    endTime: '12:00',
    venueAddress: '',
    packageName: 'Celebration',
    agreedPriceMinor: 250000,
    status: 'confirmed',
    notes: ''
  };

  const conflictResponse = await fetch(`${apiBase}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-permissions': 'bookings.write'
    },
    body: JSON.stringify(booking)
  });
  const conflict = await conflictResponse.json();
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflict.error.code, 'booking_conflict');
  assert.equal(calls.filter(([name]) => name === 'getBooking').length, 0);

  createBookingResult = { requiresOverride: false, booking: { id: bookingId } };
  const successResponse = await fetch(`${apiBase}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin': 'yes',
      'x-permissions': 'bookings.write',
      'x-request-id': '6f15f564-2dc3-41c5-a34f-21ed974a6688'
    },
    body: JSON.stringify({ ...booking, overrideReason: 'Client confirmed the schedule.' })
  });

  assert.equal(successResponse.status, 201);
  assert.deepEqual((await successResponse.json()).data, { id: bookingId });
  const savedCall = calls.filter(([name]) => name === 'createBooking').at(-1);
  assert.equal(savedCall[1], actorId);
  assert.equal(savedCall[2].overrideReason, 'Client confirmed the schedule.');
  assert.equal(savedCall[3], '6f15f564-2dc3-41c5-a34f-21ed974a6688');
});

test('summary hides counts the administrator cannot read', async () => {
  const response = await fetch(`${apiBase}/api/admin/operations/summary`, {
    headers: {
      'x-admin': 'yes',
      'x-permissions': 'dashboard.read,quotes.read'
    }
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(result.data, {
    newInquiries: null,
    quotesAwaitingReply: 4,
    upcomingBookings: null,
    balancesDueMinor: null
  });
});
