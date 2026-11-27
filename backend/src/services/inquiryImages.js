'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

class InvalidReferenceImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidReferenceImageError';
  }
}

function dataUriToBuffer(dataUri) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri);
  if (!match) throw new InvalidReferenceImageError('Unsupported reference image encoding.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new InvalidReferenceImageError('Each reference image must be 2 MB or smaller.');
  }
  return { buffer, format: match[1] };
}

async function normalizeReferenceImage(image) {
  const { buffer: input, format: declaredFormat } = dataUriToBuffer(image.data);
  const processor = sharp(input, { failOn: 'error', limitInputPixels: 25_000_000 });
  let metadata;
  try {
    metadata = await processor.metadata();
  } catch {
    throw new InvalidReferenceImageError('Reference image could not be decoded.');
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new InvalidReferenceImageError('Reference images must be JPEG, PNG, or WebP files.');
  }
  if (metadata.format !== declaredFormat) {
    throw new InvalidReferenceImageError('Reference image content does not match its declared type.');
  }
  let output;
  try {
    output = await processor.rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    throw new InvalidReferenceImageError('Reference image could not be processed.');
  }
  if (!output.length || output.length > MAX_IMAGE_BYTES) {
    throw new InvalidReferenceImageError('Processed reference images must be 2 MB or smaller.');
  }
  return {
    buffer: output,
    fileName: `${crypto.randomUUID()}.webp`,
    originalName: path.basename(image.name).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 150),
    contentType: 'image/webp'
  };
}

module.exports = { InvalidReferenceImageError, normalizeReferenceImage };
