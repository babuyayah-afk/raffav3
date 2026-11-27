'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const sharp = require('sharp');

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_PROCESSED_BYTES = 2 * 1024 * 1024;

class InvalidShowcaseImageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidShowcaseImageError';
  }
}

function decodeImageData(data) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw new InvalidShowcaseImageError('Choose a JPEG, PNG, or WebP image.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) {
    throw new InvalidShowcaseImageError('The selected image must be 5 MB or smaller.');
  }
  return { buffer, declaredFormat: match[1] };
}

async function normalizeShowcaseImage(image) {
  if (!image || typeof image.data !== 'string' || typeof image.name !== 'string') {
    throw new InvalidShowcaseImageError('Image data and a file name are required.');
  }
  const { buffer, declaredFormat } = decodeImageData(image.data);
  const processor = sharp(buffer, { failOn: 'error', limitInputPixels: 25_000_000 });
  let metadata;
  try {
    metadata = await processor.metadata();
  } catch {
    throw new InvalidShowcaseImageError('The selected image could not be decoded.');
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || metadata.format !== declaredFormat) {
    throw new InvalidShowcaseImageError('The image content does not match its file type.');
  }
  let output;
  try {
    output = await processor.rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    throw new InvalidShowcaseImageError('The selected image could not be processed.');
  }
  if (!output.length || output.length > MAX_PROCESSED_BYTES) {
    throw new InvalidShowcaseImageError('The optimized image must be 2 MB or smaller.');
  }
  return {
    buffer: output,
    fileName: `${crypto.randomUUID()}.webp`,
    originalName: path.basename(image.name.replace(/[\\/]/g, path.sep))
      .replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 150) || 'image',
    contentType: 'image/webp'
  };
}

module.exports = {
  InvalidShowcaseImageError,
  normalizeShowcaseImage
};
