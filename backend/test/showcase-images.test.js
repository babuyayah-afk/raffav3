'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { test } = require('node:test');
const {
  InvalidShowcaseImageError,
  normalizeShowcaseImage
} = require('../src/services/showcaseImages');

test('showcase uploads are re-encoded as bounded WebP images', async () => {
  const png = await sharp({
    create: { width: 4, height: 3, channels: 3, background: '#ffffff' }
  }).png().toBuffer();
  const image = await normalizeShowcaseImage({
    name: '..\\portfolio.png',
    data: `data:image/png;base64,${png.toString('base64')}`
  });
  const metadata = await sharp(image.buffer).metadata();
  assert.equal(image.contentType, 'image/webp');
  assert.match(image.fileName, /^[0-9a-f-]{36}\.webp$/);
  assert.equal(image.originalName, 'portfolio.png');
  assert.equal(metadata.format, 'webp');
  assert.ok(image.buffer.length <= 2 * 1024 * 1024);
});

test('showcase image validation rejects mismatched media types', async () => {
  const png = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#ffffff' }
  }).png().toBuffer();
  await assert.rejects(() => normalizeShowcaseImage({
    name: 'image.png',
    data: `data:image/webp;base64,${png.toString('base64')}`
  }), InvalidShowcaseImageError);
});
