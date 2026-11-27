'use strict';

const { z } = require('zod');

const showcaseTypes = ['dessert_package', 'event_package', 'portfolio_item', 'faq'];
const text = (max) => z.string().max(max).refine(
  (value) => !value.includes('\u0000'),
  'Text must not contain a null character.'
);
const sectionKeys = [
  'home.heroCards',
  'home.stats',
  'home.services',
  'home.projects',
  'home.testimonials',
  'home.packages',
  'home.faq',
  'apparel.catalog',
  'apparel.newsletter'
];

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(showcaseTypes),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: text(160).trim().min(1),
  summary: text(1000).default(''),
  body: text(10000).default(''),
  details: z.record(z.string(), z.unknown()).default({}),
  imageAssetId: z.string().uuid().nullable().default(null),
  status: z.enum(['draft', 'published']),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(10000).default(0)
}).strict();

const sectionsSchema = z.array(z.object({
  sectionKey: z.enum(sectionKeys),
  title: text(160).trim().min(1),
  displayOrder: z.number().int().min(0).max(10000),
  isVisible: z.boolean()
}).strict()).max(50).refine(
  (sections) => new Set(sections.map((section) => section.sectionKey)).size === sections.length,
  'Each section can appear only once.'
);

function parseItem(value) {
  const result = itemSchema.safeParse(value);
  if (result.success && containsNullCharacter(result.data.details)) {
    return { errors: ['Additional details must not contain null characters.'] };
  }
  return result.success
    ? { value: result.data }
    : { errors: result.error.issues.map((issue) => issue.message) };
}

function containsNullCharacter(value) {
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some(containsNullCharacter);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, entry]) =>
      key.includes('\u0000') || containsNullCharacter(entry));
  }
  return false;
}

function parseSections(value) {
  const result = sectionsSchema.safeParse(value);
  return result.success
    ? { value: result.data.map((section) => ({
      section_key: section.sectionKey,
      title: section.title,
      display_order: section.displayOrder,
      is_visible: section.isVisible
    })) }
    : { errors: result.error.issues.map((issue) => issue.message) };
}

function parseUpload(value) {
  const result = z.object({
    name: z.string().trim().min(1).max(255),
    data: z.string().min(1).max(7_100_000),
    altText: text(500).default('')
  }).strict().safeParse(value);
  return result.success
    ? { value: result.data }
    : { errors: result.error.issues.map((issue) => issue.message) };
}

function parseAssetUpdate(value) {
  const result = z.object({
    altText: text(500).default(''),
    archive: z.boolean().default(false)
  }).strict().safeParse(value);
  return result.success
    ? { value: result.data }
    : { errors: result.error.issues.map((issue) => issue.message) };
}

function parseListQuery(query) {
  const result = z.object({
    type: z.enum(showcaseTypes).optional(),
    status: z.enum(['draft', 'published', 'all']).default('all'),
    search: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25)
  }).strict().safeParse(query);
  return result.success
    ? { value: result.data }
    : { errors: result.error.issues.map((issue) => issue.message) };
}

module.exports = {
  parseAssetUpdate,
  parseItem,
  parseListQuery,
  parseSections,
  parseUpload
};
