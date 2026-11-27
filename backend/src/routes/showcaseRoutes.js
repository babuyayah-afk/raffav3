'use strict';

const express = require('express');
const {
  InvalidShowcaseImageError,
  normalizeShowcaseImage
} = require('../services/showcaseImages');
const {
  parseAssetUpdate,
  parseItem,
  parseListQuery,
  parseSections,
  parseUpload
} = require('../validators/showcaseValidator');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestId(req) {
  const value = req.get('x-request-id');
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value
    : null;
}

function validId(req, res, next) {
  if (!UUID_PATTERN.test(req.params.id)) {
    return res.status(422).json({ error: 'validation_failed', message: 'A valid item ID is required.' });
  }
  return next();
}

function writeFailure(res, error, message) {
  if (error.code === '23505') {
    return res.status(409).json({ error: 'conflict', message: 'An entry with this URL slug already exists.' });
  }
  if (error.code === '23503') {
    return res.status(422).json({ error: 'validation_failed', message: 'The selected media asset is unavailable.' });
  }
  if (error.code === 'P0002') {
    return res.status(404).json({ error: 'not_found' });
  }
  return res.status(500).json({ error: 'internal_error', message });
}

function createShowcaseRouter({
  repository,
  limiters,
  requireAdmin,
  requirePermission,
  logger = console
}) {
  if (!repository || !limiters?.admin || typeof requireAdmin !== 'function' ||
      typeof requirePermission !== 'function') {
    throw new TypeError('Showcase routes require a repository and admin middleware.');
  }
  const router = express.Router();

  router.get('/api/admin/showcase', limiters.admin, requireAdmin,
    requirePermission('content.read'), async (req, res) => {
      const parsed = parseListQuery(req.query);
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        return res.json(await repository.listItems(parsed.value));
      } catch (error) {
        logger.error('Failed to list showcase items:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.post('/api/admin/showcase', limiters.admin, requireAdmin,
    requirePermission('content.write'), async (req, res) => {
      const parsed = parseItem(req.body);
      if (parsed.errors || parsed.value?.id) {
        return res.status(422).json({
          error: 'validation_failed',
          details: parsed.errors || ['New entries must not include an ID.']
        });
      }
      try {
        const item = await repository.saveItem(req.adminUser.id, parsed.value, requestId(req));
        return res.status(201).json({ item });
      } catch (error) {
        logger.error('Failed to create showcase item:', error);
        return writeFailure(res, error, 'Unable to save showcase content.');
      }
    });

  router.put('/api/admin/showcase/:id', limiters.admin, requireAdmin, validId,
    requirePermission('content.write'), async (req, res) => {
      const parsed = parseItem({ ...req.body, id: req.params.id });
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        const item = await repository.saveItem(req.adminUser.id, parsed.value, requestId(req));
        return res.json({ item });
      } catch (error) {
        logger.error('Failed to update showcase item:', error);
        return writeFailure(res, error, 'Unable to save showcase content.');
      }
    });

  router.delete('/api/admin/showcase/:id', limiters.admin, requireAdmin, validId,
    requirePermission('content.write'), async (req, res) => {
      try {
        const archived = await repository.archiveItem(req.adminUser.id, req.params.id, requestId(req));
        return archived
          ? res.status(204).end()
          : res.status(404).json({ error: 'not_found' });
      } catch (error) {
        logger.error('Failed to archive showcase item:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.get('/api/admin/site-sections', limiters.admin, requireAdmin,
    requirePermission('content.read'), async (req, res) => {
      try {
        return res.json({ items: await repository.listSections() });
      } catch (error) {
        logger.error('Failed to list homepage sections:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.put('/api/admin/site-sections', limiters.admin, requireAdmin,
    requirePermission('content.write'), async (req, res) => {
      const parsed = parseSections(req.body?.items);
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        return res.json({ items: await repository.saveSections(
          req.adminUser.id, parsed.value, requestId(req)
        ) });
      } catch (error) {
        logger.error('Failed to save homepage sections:', error);
        return writeFailure(res, error, 'Unable to save section settings.');
      }
    });

  router.get('/api/admin/media', limiters.admin, requireAdmin,
    requirePermission('media.read'), async (req, res) => {
      const parsed = parseListQuery({ ...req.query, type: undefined, status: 'all' });
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        return res.json(await repository.listAssets(parsed.value));
      } catch (error) {
        logger.error('Failed to list showcase media:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  router.post('/api/admin/media', limiters.admin, requireAdmin,
    requirePermission('media.write'), async (req, res) => {
      const parsed = parseUpload(req.body);
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        const image = await normalizeShowcaseImage({
          name: parsed.value.name,
          data: parsed.value.data
        });
        const asset = await repository.uploadAsset(
          req.adminUser.id, image, parsed.value.altText, requestId(req)
        );
        return res.status(201).json({ item: asset });
      } catch (error) {
        if (error instanceof InvalidShowcaseImageError) {
          return res.status(422).json({ error: 'validation_failed', message: error.message });
        }
        logger.error('Failed to upload showcase media:', error);
        return res.status(500).json({ error: 'internal_error', message: 'Unable to upload this image.' });
      }
    });

  router.patch('/api/admin/media/:id', limiters.admin, requireAdmin, validId,
    requirePermission('media.write'), async (req, res) => {
      const parsed = parseAssetUpdate(req.body);
      if (parsed.errors) return res.status(422).json({ error: 'validation_failed', details: parsed.errors });
      try {
        const item = await repository.updateAsset(
          req.adminUser.id,
          req.params.id,
          parsed.value.altText,
          parsed.value.archive,
          requestId(req)
        );
        return res.json({ item });
      } catch (error) {
        if (error.code === 'P0002') return res.status(404).json({ error: 'not_found' });
        if (error.code === '23503') {
          return res.status(409).json({ error: 'asset_in_use', message: error.message });
        }
        logger.error('Failed to update showcase media:', error);
        return res.status(500).json({ error: 'internal_error' });
      }
    });

  return router;
}

module.exports = { createShowcaseRouter };
