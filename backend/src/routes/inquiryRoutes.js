'use strict';

const crypto = require('node:crypto');
const express = require('express');
const {
  InvalidReferenceImageError,
  normalizeReferenceImage
} = require('../services/inquiryImages');
const {
  inquiryListQuerySchema,
  inquiryNoteSchema,
  inquiryStatusUpdateSchema,
  validateInquirySubmission
} = require('../validators/inquiryValidator');

const STORAGE_BUCKET = 'inquiry-references';
const MAX_STORED_REFERENCE_IMAGE_BYTES = 5 * 1024 * 1024;

async function verifyTurnstile(token, remoteIp, secret, fetchImpl = globalThis.fetch) {
  if (!secret || typeof token !== 'string' || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Turnstile verification returned ${response.status}.`);
  const result = await response.json();
  return result.success === true;
}

function createInquiryRouter({
  repository,
  limiters,
  requireAdmin,
  requirePermission,
  notifier,
  normalizeImage = normalizeReferenceImage,
  turnstileSecret = process.env.TURNSTILE_SECRET_KEY || '',
  turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '',
  verifyCaptcha = (token, ip) => verifyTurnstile(token, ip, turnstileSecret),
  uploadImage = async (path, file) => {
    const result = await repository.storage.from(STORAGE_BUCKET).upload(path, file.buffer, {
      contentType: file.contentType,
      upsert: false
    });
    if (result.error) throw result.error;
  },
  removeImages = async (paths) => {
    if (!paths.length) return;
    const result = await repository.storage.from(STORAGE_BUCKET).remove(paths);
    if (result.error) throw result.error;
  },
  logger = console,
  now = () => new Date(),
  createId = () => crypto.randomUUID()
}) {
  if (!repository || !limiters || typeof requireAdmin !== 'function' ||
      typeof requirePermission !== 'function') {
    throw new TypeError('Inquiry routes require a repository and API dependencies.');
  }
  const router = express.Router();

  router.get('/public/inquiries/config', (req, res) => {
    if (!turnstileSiteKey) {
      return res.status(503).json({
        error: 'captcha_unavailable',
        message: 'Inquiry security is not configured yet.'
      });
    }
    return res.set('Cache-Control', 'public, max-age=300')
      .json({ turnstileSiteKey });
  });

  router.post('/public/inquiries', limiters.publicInquiry, async (req, res) => {
    const { errors, value } = validateInquirySubmission(req.body);
    if (errors) return res.status(422).json({ error: 'validation_failed', details: errors });

    if (value.website) {
      logger.warn('Inquiry rejected by honeypot.', { ip: req.ip });
      return res.status(422).json({ error: 'spam_rejected', message: 'The inquiry could not be accepted.' });
    }
    if (!turnstileSecret) {
      logger.error('Inquiry rejected because Turnstile verification is not configured.');
      return res.status(503).json({ error: 'captcha_unavailable', message: 'Inquiry security is not configured yet.' });
    }
    let captchaValid = false;
    try {
      captchaValid = await verifyCaptcha(value.captchaToken, req.ip);
    } catch (error) {
      logger.error('Turnstile verification failed.', error);
      return res.status(503).json({ error: 'captcha_unavailable', message: 'Please retry the security check.' });
    }
    if (!captchaValid) {
      logger.warn('Inquiry rejected by Turnstile.', { ip: req.ip });
      return res.status(422).json({ error: 'captcha_failed', message: 'Complete the security check and try again.' });
    }

    const uploadedPaths = [];
    try {
      const attachments = [];
      const normalizedImages = [];
      let totalStoredBytes = 0;
      for (const image of value.referenceImages) {
        const normalized = await normalizeImage(image);
        totalStoredBytes += normalized.buffer.length;
        if (totalStoredBytes > MAX_STORED_REFERENCE_IMAGE_BYTES) {
          return res.status(422).json({
            error: 'validation_failed',
            details: ['referenceImages: Processed images must total 5 MB or less.']
          });
        }
        normalizedImages.push(normalized);
      }
      for (const normalized of normalizedImages) {
        const storagePath = `${now().toISOString().slice(0, 10)}/${createId()}.webp`;
        await uploadImage(storagePath, normalized);
        uploadedPaths.push(storagePath);
        attachments.push({
          storage_path: storagePath,
          file_name: normalized.originalName,
          content_type: normalized.contentType,
          file_size_bytes: normalized.buffer.length
        });
      }

      const recipients = String(process.env.INQUIRY_NOTIFICATION_RECIPIENTS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
      const saved = await repository.createInquiry({
        id: createId(),
        type: value.type,
        name: value.name,
        email: value.email,
        phone: value.phone || null,
        message: value.message,
        details: value.details,
        source: req.get('origin') || 'website',
        attachments,
        recipients,
        createdAt: now().toISOString()
      });
      if (notifier) notifier.notifyInquiry().catch((error) =>
        logger.error('Unable to process inquiry email notification immediately.', error)
      );
      return res.status(201).json({
        data: { id: saved.id, status: saved.status, createdAt: saved.created_at },
        error: null,
        meta: {}
      });
    } catch (error) {
      if (uploadedPaths.length) {
        try {
          await removeImages(uploadedPaths);
        } catch (cleanupError) {
          logger.error('Failed to remove unreferenced inquiry images.', cleanupError);
        }
      }
      if (error instanceof InvalidReferenceImageError) {
        logger.warn('Inquiry rejected because a reference image was invalid.', { message: error.message });
        return res.status(422).json({
          error: 'validation_failed',
          details: ['referenceImages: Use valid JPEG, PNG, or WebP images within the size limits.']
        });
      }
      logger.error('Failed to save public inquiry.', error);
      return res.status(500).json({
        error: { code: 'inquiry_save_failed', message: 'Unable to save the inquiry.' }
      });
    }
  });

  router.get('/api/admin/inquiries', limiters.admin, requireAdmin,
    requirePermission('inquiries.read'), async (req, res) => {
      const parsed = inquiryListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(422).json({
          error: { code: 'validation_failed', message: 'Inquiry filters are invalid.' },
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        });
      }
      try {
        const followUpDays = Number(process.env.INQUIRY_FOLLOW_UP_DAYS || 3);
        if (!Number.isInteger(followUpDays) || followUpDays < 1 || followUpDays > 365) {
          throw new Error('INQUIRY_FOLLOW_UP_DAYS must be an integer from 1 to 365.');
        }
        const result = await repository.listInquiries({
          ...parsed.data,
          actorId: req.adminUser.id,
          followUpDays
        });
        return res.json({
          data: result.items,
          error: null,
          meta: {
            page: parsed.data.page,
            limit: parsed.data.limit,
            total: result.total,
            unread: result.unread
          }
        });
      } catch (error) {
        if (error.code === '42501') {
          return res.status(403).json({ error: { code: 'forbidden', message: 'You cannot view inquiries.' } });
        }
        logger.error('Failed to list inquiries.', error);
        return res.status(500).json({ error: { code: 'internal_error', message: 'Unable to load inquiries.' } });
      }
    });

  router.get('/api/admin/inquiries/assignees', limiters.admin, requireAdmin,
    requirePermission('inquiries.read'), async (req, res) => {
      try {
        return res.json({ data: await repository.listAssignees(), error: null, meta: {} });
      } catch (error) {
        logger.error('Failed to list inquiry assignees.', error);
        return res.status(500).json({ error: { code: 'internal_error', message: 'Unable to load team members.' } });
      }
    });

  router.get('/api/admin/inquiries/reply-templates', limiters.admin, requireAdmin,
    requirePermission('inquiries.read'), async (req, res) => {
      try {
        const items = await repository.listReplyTemplates(req.query.type);
        return res.json({ data: items, error: null, meta: {} });
      } catch (error) {
        logger.error('Failed to list inquiry reply templates.', error);
        return res.status(500).json({ error: { code: 'internal_error', message: 'Unable to load reply templates.' } });
      }
    });

  router.get('/api/admin/inquiries/:id', limiters.admin, requireAdmin,
    requirePermission('inquiries.read'), async (req, res) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(422).json({ error: { code: 'validation_failed', message: 'Inquiry id is invalid.' } });
      }
      try {
        const inquiry = await repository.getInquiry(req.params.id);
        if (!inquiry) return res.status(404).json({ error: { code: 'not_found', message: 'Inquiry not found.' } });
        return res.json({ data: inquiry, error: null, meta: {} });
      } catch (error) {
        logger.error('Failed to read inquiry details.', error);
        return res.status(500).json({ error: { code: 'internal_error', message: 'Unable to load inquiry details.' } });
      }
    });

  router.patch('/api/admin/inquiries/:id', limiters.admin, requireAdmin,
    requirePermission('inquiries.status.update'), async (req, res) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(422).json({ error: { code: 'validation_failed', message: 'Inquiry id is invalid.' } });
      }
      const params = inquiryStatusUpdateSchema.safeParse(req.body);
      if (!params.success) {
        return res.status(422).json({ error: { code: 'validation_failed', message: 'Inquiry update is invalid.' } });
      }
      if (['lost', 'declined'].includes(params.data.status) && !params.data.reason) {
        return res.status(422).json({
          error: { code: 'reason_required', message: 'A reason is required when marking an inquiry lost or declined.' }
        });
      }
      if (Object.hasOwn(params.data, 'assigneeId') &&
          !req.adminUser?.permissions?.includes('inquiries.assign')) {
        return res.status(403).json({ error: { code: 'forbidden', message: 'You cannot assign inquiries.' } });
      }
      try {
        const updated = await repository.updateInquiry({
          actorId: req.adminUser.id,
          inquiryId: req.params.id,
          status: params.data.status,
          reason: params.data.reason,
          assigneeId: params.data.assigneeId,
          assigneeSet: Object.hasOwn(params.data, 'assigneeId')
        });
        return res.json({ data: updated, error: null, meta: {} });
      } catch (error) {
        const status = error.code === 'P0002' ? 404 :
          error.code === '22023' ? 422 : error.code === '42501' ? 403 : 500;
        if (status === 500) logger.error('Failed to update inquiry.', error);
        return res.status(status).json({
          error: {
            code: status === 404 ? 'not_found' : status === 422 ? 'invalid_transition' :
              status === 403 ? 'forbidden' : 'internal_error',
            message: status === 404 ? 'Inquiry or assignee not found.' :
              status === 422 ? error.message : status === 403 ? 'You cannot update this inquiry.' : 'Unable to update inquiry.'
          }
        });
      }
    });

  router.post('/api/admin/inquiries/:id/notes', limiters.admin, requireAdmin,
    requirePermission('inquiries.notes.write'), async (req, res) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) {
        return res.status(422).json({ error: { code: 'validation_failed', message: 'Inquiry id is invalid.' } });
      }
      const parsed = inquiryNoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(422).json({ error: { code: 'validation_failed', message: 'Enter a note of 1-2000 characters.' } });
      }
      try {
        const note = await repository.addNote({
          actorId: req.adminUser.id,
          inquiryId: req.params.id,
          note: parsed.data.note
        });
        return res.status(201).json({ data: note, error: null, meta: {} });
      } catch (error) {
        const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 500;
        if (status === 500) logger.error('Failed to add inquiry note.', error);
        return res.status(status).json({
          error: {
            code: status === 404 ? 'not_found' : status === 403 ? 'forbidden' : 'internal_error',
            message: status === 403 ? 'You cannot add inquiry notes.' : 'Unable to save note.'
          }
        });
      }
    });

  return router;
}

module.exports = { createInquiryRouter, verifyTurnstile };
