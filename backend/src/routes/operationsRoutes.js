'use strict';

const express = require('express');
const {
  parseBooking,
  parseBookingFromInquiry,
  parseCapacity,
  parseCustomer,
  parseListQuery,
  parsePayment,
  parseQuote,
  parseQuoteStatus,
  UUID_PATTERN
} = require('../validators/operationsValidator');

function requestId(req) {
  const value = req.get('x-request-id');
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function validationFailure(res, errors) {
  return res.status(422).json({
    data: null,
    error: { code: 'validation_failed', message: 'Check the submitted fields.' },
    details: errors,
    meta: {}
  });
}

function errorResponse(res, error, logger, operation) {
  const status = error.code === '42501' ? 403
    : error.code === 'P0002' ? 404
      : error.code === '23505' ? 409
        : error.code === '22023' ? 422
          : 500;
  if (status === 500) logger.error(`Failed to ${operation}.`, error);
  return res.status(status).json({
    data: null,
    error: {
      code: status === 403 ? 'forbidden'
        : status === 404 ? 'not_found'
          : status === 409 ? 'conflict'
            : status === 422 ? 'invalid_request'
              : 'internal_error',
      message: status === 403 ? 'You do not have permission to perform this action.'
        : status === 404 ? 'The requested record was not found.'
          : status === 409 ? 'A record with these details already exists.'
            : status === 422 ? error.message
              : 'The operation could not be completed.'
    },
    meta: {}
  });
}

function statusFilter(parsed, allowed) {
  if (parsed.status && !allowed.includes(parsed.status)) {
    return { errors: [{ field: 'status', message: 'Choose a supported status.' }] };
  }
  return { value: parsed };
}

function createOperationsRouter({
  repository,
  limiters,
  requireAdmin,
  requirePermission,
  requireAdminStepUp = (req, res, next) => next(),
  logger = console
}) {
  if (!repository || !limiters?.admin || typeof requireAdmin !== 'function' ||
      typeof requirePermission !== 'function') {
    throw new TypeError('Operations routes require a repository and admin middleware.');
  }
  const router = express.Router();

  router.get('/api/admin/customers', limiters.admin, requireAdmin,
    requirePermission('customers.read'), async (req, res) => {
      const parsed = parseListQuery(req.query);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const result = await repository.listCustomers(parsed.value);
        return res.json({
          data: result.items,
          error: null,
          meta: { total: result.total, page: parsed.value.page, limit: parsed.value.limit }
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'list customers');
      }
    });

  router.get('/api/admin/customers/:id', limiters.admin, requireAdmin,
    requirePermission('customers.read'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid customer ID is required.' }
      ]);
      try {
        const customer = await repository.getCustomer(req.params.id);
        if (!customer) return res.status(404).json({
          data: null, error: { code: 'not_found', message: 'Customer not found.' }, meta: {}
        });
        return res.json({ data: customer, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'read customer');
      }
    });

  router.post('/api/admin/customers', limiters.admin, requireAdmin,
    requirePermission('customers.write'), async (req, res) => {
      const parsed = parseCustomer(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const customer = await repository.saveCustomer(
          req.adminUser.id, null, parsed.value, requestId(req)
        );
        return res.status(201).json({ data: customer, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'create customer');
      }
    });

  router.patch('/api/admin/customers/:id', limiters.admin, requireAdmin,
    requirePermission('customers.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid customer ID is required.' }
      ]);
      const parsed = parseCustomer(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const customer = await repository.saveCustomer(
          req.adminUser.id, req.params.id, parsed.value, requestId(req)
        );
        return res.json({ data: customer, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'update customer');
      }
    });

  router.get('/api/admin/quotes', limiters.admin, requireAdmin,
    requirePermission('quotes.read'), async (req, res) => {
      const parsed = parseListQuery(req.query);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      const checked = statusFilter(parsed.value, ['draft', 'sent', 'accepted', 'declined', 'expired']);
      if (checked.errors) return validationFailure(res, checked.errors);
      try {
        const result = await repository.listQuotes(checked.value);
        return res.json({
          data: result.items,
          error: null,
          meta: { total: result.total, page: parsed.value.page, limit: parsed.value.limit }
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'list quotes');
      }
    });

  router.post('/api/admin/quotes', limiters.admin, requireAdmin,
    requirePermission('quotes.write'), async (req, res) => {
      const parsed = parseQuote(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const quote = await repository.saveQuote(
          req.adminUser.id, null, parsed.value, requestId(req)
        );
        return res.status(201).json({ data: quote, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'create quote');
      }
    });

  router.get('/api/admin/quotes/:id', limiters.admin, requireAdmin,
    requirePermission('quotes.read'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid quote ID is required.' }
      ]);
      try {
        const quote = await repository.getQuote(req.params.id);
        if (!quote) return res.status(404).json({
          data: null, error: { code: 'not_found', message: 'Quote not found.' }, meta: {}
        });
        return res.json({ data: quote, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'read quote');
      }
    });

  router.put('/api/admin/quotes/:id', limiters.admin, requireAdmin,
    requirePermission('quotes.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid quote ID is required.' }
      ]);
      const parsed = parseQuote(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const quote = await repository.saveQuote(
          req.adminUser.id, req.params.id, parsed.value, requestId(req)
        );
        if (!quote) return res.status(404).json({
          data: null, error: { code: 'not_found', message: 'Quote not found.' }, meta: {}
        });
        return res.json({ data: quote, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'update quote');
      }
    });

  router.patch('/api/admin/quotes/:id/status', limiters.admin, requireAdmin,
    requirePermission('quotes.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid quote ID is required.' }
      ]);
      const parsed = parseQuoteStatus(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const quote = await repository.setQuoteStatus(
          req.adminUser.id, req.params.id, parsed.value.status, requestId(req)
        );
        if (!quote) return res.status(404).json({
          data: null, error: { code: 'not_found', message: 'Quote not found.' }, meta: {}
        });
        return res.json({ data: quote, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'update quote status');
      }
    });

  router.get('/api/admin/bookings', limiters.admin, requireAdmin,
    requirePermission('bookings.read'), async (req, res) => {
      const parsed = parseListQuery(req.query);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      const checked = statusFilter(parsed.value, ['scheduled', 'confirmed', 'completed', 'cancelled']);
      if (checked.errors) return validationFailure(res, checked.errors);
      try {
        const result = await repository.listBookings(checked.value);
        return res.json({
          data: result.items,
          error: null,
          meta: { total: result.total, page: parsed.value.page, limit: parsed.value.limit }
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'list bookings');
      }
    });

  router.get('/api/admin/calendar', limiters.admin, requireAdmin,
    requirePermission('calendar.read'), async (req, res) => {
      const parsed = parseListQuery(req.query);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      if (!parsed.value.from || !parsed.value.to) {
        return validationFailure(res, [{
          field: 'from',
          message: 'Calendar views require a start and end date.'
        }]);
      }
      const checked = statusFilter(parsed.value, ['scheduled', 'confirmed', 'completed', 'cancelled']);
      if (checked.errors) return validationFailure(res, checked.errors);
      try {
        const result = await repository.listBookings(checked.value);
        return res.json({
          data: result.items,
          error: null,
          meta: { total: result.total, page: parsed.value.page, limit: parsed.value.limit }
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'load calendar');
      }
    });

  router.post('/api/admin/bookings/from-inquiry/:id', limiters.admin, requireAdmin,
    requirePermission('bookings.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid inquiry ID is required.' }
      ]);
      const parsed = parseBookingFromInquiry(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const result = await repository.createBookingFromInquiry(
          req.adminUser.id, req.params.id, parsed.value, requestId(req)
        );
        if (result.requiresOverride) {
          return res.status(409).json({
            data: null,
            error: { code: 'booking_conflict', message: 'This date has a scheduling conflict.' },
            conflicts: result.conflicts,
            meta: {}
          });
        }
        const booking = await repository.getBooking(result.booking.id);
        return res.status(201).json({ data: booking, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'convert inquiry to booking');
      }
    });

  router.post('/api/admin/bookings', limiters.admin, requireAdmin,
    requirePermission('bookings.write'), async (req, res) => {
      const parsed = parseBooking(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const result = await repository.createBooking(
          req.adminUser.id, parsed.value, requestId(req)
        );
        if (result.requiresOverride) {
          return res.status(409).json({
            data: null,
            error: { code: 'booking_conflict', message: 'This date has a scheduling conflict.' },
            conflicts: result.conflicts,
            meta: {}
          });
        }
        const booking = await repository.getBooking(result.booking.id);
        return res.status(201).json({ data: booking, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'create booking');
      }
    });

  router.get('/api/admin/bookings/:id', limiters.admin, requireAdmin,
    requirePermission('bookings.read'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid booking ID is required.' }
      ]);
      try {
        const booking = await repository.getBooking(req.params.id);
        if (!booking) return res.status(404).json({
          data: null, error: { code: 'not_found', message: 'Booking not found.' }, meta: {}
        });
        return res.json({ data: booking, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'read booking');
      }
    });

  router.patch('/api/admin/bookings/:id', limiters.admin, requireAdmin,
    requirePermission('bookings.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid booking ID is required.' }
      ]);
      const parsed = parseBookingFromInquiry(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const result = await repository.updateBooking(
          req.adminUser.id, req.params.id, parsed.value, requestId(req)
        );
        if (result.requiresOverride) {
          return res.status(409).json({
            data: null,
            error: { code: 'booking_conflict', message: 'This date has a scheduling conflict.' },
            conflicts: result.conflicts,
            meta: {}
          });
        }
        const booking = await repository.getBooking(req.params.id);
        return res.json({ data: booking, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'update booking');
      }
    });

  router.post('/api/admin/bookings/:id/payments', limiters.admin, requireAdmin,
    requirePermission('bookings.write'), async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) return validationFailure(res, [
        { field: 'id', message: 'A valid booking ID is required.' }
      ]);
      const parsed = parsePayment(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const booking = await repository.recordPayment(
          req.adminUser.id, req.params.id, parsed.value, requestId(req)
        );
        return res.status(201).json({ data: booking, error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'record booking payment');
      }
    });

  router.get('/api/admin/operations/summary', limiters.admin, requireAdmin,
    requirePermission('dashboard.read'), async (req, res) => {
      try {
        const summary = await repository.getSummary(req.adminUser.id);
        const permissions = new Set(req.adminUser.permissions || []);
        return res.json({
          data: {
            newInquiries: permissions.has('inquiries.read') ? summary.newInquiries : null,
            quotesAwaitingReply: permissions.has('quotes.read') ? summary.quotesAwaitingReply : null,
            upcomingBookings: permissions.has('bookings.read') || permissions.has('calendar.read')
              ? summary.upcomingBookings : null,
            balancesDueMinor: permissions.has('bookings.read') ? summary.balancesDueMinor : null
          },
          error: null,
          meta: {}
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'load operations summary');
      }
    });

  router.get('/api/admin/operations/settings/dessert-capacity', limiters.admin, requireAdmin,
    requirePermission('settings.read'), async (req, res) => {
      try {
        return res.json({ data: await repository.getCapacity(), error: null, meta: {} });
      } catch (error) {
        return errorResponse(res, error, logger, 'read dessert capacity');
      }
    });

  router.put('/api/admin/operations/settings/dessert-capacity', limiters.admin, requireAdmin,
    requirePermission('settings.manage'), requireAdminStepUp, async (req, res) => {
      const parsed = parseCapacity(req.body);
      if (parsed.errors) return validationFailure(res, parsed.errors);
      try {
        const setting = await repository.setCapacity(
          req.adminUser.id, parsed.value.limit, requestId(req)
        );
        return res.json({
          data: { limit: setting.limit ?? null },
          error: null,
          meta: {}
        });
      } catch (error) {
        return errorResponse(res, error, logger, 'update dessert capacity');
      }
    });

  return router;
}

module.exports = { createOperationsRouter };
