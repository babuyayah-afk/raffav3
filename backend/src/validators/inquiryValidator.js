'use strict';

const { z } = require('zod');

const INQUIRY_TYPES = ['events', 'desserts', 'general', 'apparels'];
const INQUIRY_STATUSES = [
  'new', 'contacted', 'quote_sent', 'confirmed', 'completed', 'lost', 'declined'
];
const IMAGE_DATA_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 3;
const NAME_PATTERN = /^[\p{L}\p{M}\p{N} &.,'’\u2010-\u2015-]+$/u;
const INQUIRY_DETAIL_OPTIONS = {
  events: {
    categoryKey: 'eventType',
    options: [
      'Birthday', 'Wedding', 'Graduation', 'Anniversary', 'Baby shower',
      'Bridal shower', 'Engagement party', 'Corporate event', 'Family gathering', 'Other'
    ],
    otherValue: 'Other',
    otherKey: 'eventTypeOther'
  },
  desserts: {
    categoryKey: 'dessertType',
    options: [
      'Celebration cake', 'Wedding cake', 'Cupcakes', 'Cookies & treats',
      'Dessert boxes', 'Dessert table', 'Other desserts'
    ],
    otherValue: 'Other desserts',
    otherKey: 'dessertTypeOther'
  },
  apparels: {
    categoryKey: 'apparelCategory',
    options: ['Clothing', 'Shoes', 'Handbags', 'Accessories', 'Other'],
    otherValue: 'Other',
    otherKey: 'apparelCategoryOther'
  },
  general: null
};

const textField = (max) => z.string().max(max).transform((value) =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
);

const inquirySubmissionSchema = z.object({
  type: z.enum(INQUIRY_TYPES),
  name: textField(100).pipe(z.string().min(2).regex(NAME_PATTERN, 'Name contains unsupported characters.')),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.union([z.literal(''), z.string().trim().regex(/^[0-9+\-()\s]{7,20}$/)]).optional(),
  message: textField(2000).pipe(z.string().min(1, 'Message is required.')),
  details: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,49}$/), z.union([
    textField(1000),
    z.number().finite(),
    z.boolean(),
    z.array(textField(200)).max(20)
  ])).optional().default({}),
  website: z.string().max(500).optional().default(''),
  captchaToken: z.string().trim().min(1).max(2048),
  referenceImages: z.array(z.object({
    name: z.string().trim().min(1).max(150),
    data: z.string().max(3_000_000).regex(IMAGE_DATA_PATTERN)
  }).strict()).max(MAX_IMAGES).optional().default([])
}).strict().superRefine((value, context) => {
  const detailOptions = INQUIRY_DETAIL_OPTIONS[value.type];
  const allowedDetailKeys = detailOptions
    ? [detailOptions.categoryKey, ...(detailOptions.otherKey ? [detailOptions.otherKey] : [])]
    : [];
  for (const key of Object.keys(value.details)) {
    if (!allowedDetailKeys.includes(key)) {
      context.addIssue({
        code: 'custom',
        path: ['details', key],
        message: 'This inquiry detail is not allowed.'
      });
    }
  }
  if (detailOptions) {
    const category = value.details[detailOptions.categoryKey];
    if (!detailOptions.options.includes(category)) {
      context.addIssue({
        code: 'custom',
        path: ['details', detailOptions.categoryKey],
        message: 'Choose an allowed inquiry option.'
      });
    }
    if (detailOptions.otherKey && category === detailOptions.otherValue) {
      const otherValue = value.details[detailOptions.otherKey];
      if (typeof otherValue !== 'string' || otherValue.length === 0 || otherValue.length > 100) {
        context.addIssue({
          code: 'custom',
          path: ['details', detailOptions.otherKey],
          message: 'Provide a description of 1 to 100 characters when selecting Other.'
        });
      }
    } else if (detailOptions.otherKey && value.details[detailOptions.otherKey] !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['details', detailOptions.otherKey],
        message: 'This detail is only allowed when Other is selected.'
      });
    }
  }
  if (Object.keys(value.details).length > 30 ||
      JSON.stringify(value.details).length > 20_000) {
    context.addIssue({
      code: 'custom',
      path: ['details'],
      message: 'Inquiry details are too large.'
    });
  }
  if (value.type === 'events' && value.details.eventType === 'Other') {
    const otherEventType = value.details.eventTypeOther;
    if (typeof otherEventType !== 'string' ||
        otherEventType.length === 0 ||
        otherEventType.length > 100) {
      context.addIssue({
        code: 'custom',
        path: ['details', 'eventTypeOther'],
        message: 'Provide an event type of 1 to 100 characters when selecting Other.'
      });
    }
  }
  let totalBytes = 0;
  for (const [index, image] of value.referenceImages.entries()) {
    const encoded = image.data.slice(image.data.indexOf(',') + 1);
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
    const bytes = Math.floor(encoded.length * 3 / 4) - padding;
    if (bytes > MAX_IMAGE_BYTES) {
      context.addIssue({
        code: 'custom',
        path: ['referenceImages', index],
        message: 'Each reference image must be 2 MB or smaller.'
      });
    }
    totalBytes += bytes;
  }
  if (totalBytes > 5 * 1024 * 1024) {
    context.addIssue({
      code: 'custom',
      path: ['referenceImages'],
      message: 'Reference images must total 5 MB or less.'
    });
  }
});

const inquiryListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(INQUIRY_TYPES).optional(),
  status: z.enum(INQUIRY_STATUSES).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  assignee: z.string().uuid().optional(),
  sort: z.enum(['created_at', 'updated_at', 'last_activity_at', 'name', 'status']).default('created_at'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25)
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be earlier than or equal to to.',
  path: ['from']
});

const inquiryStatusUpdateSchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  reason: textField(500).optional(),
  assigneeId: z.union([z.string().uuid(), z.null()]).optional()
}).strict().refine((value) =>
  value.status !== undefined || value.assigneeId !== undefined
);

const inquiryNoteSchema = z.object({
  note: textField(2000).pipe(z.string().min(1))
}).strict();

function validateInquirySubmission(body) {
  const result = inquirySubmissionSchema.safeParse(body);
  if (result.success) return { value: result.data };
  return {
    errors: result.error.issues.map((issue) =>
      `${issue.path.join('.') || 'request'}: ${issue.message}`
    )
  };
}

module.exports = {
  INQUIRY_STATUSES,
  INQUIRY_TYPES,
  inquiryListQuerySchema,
  inquiryNoteSchema,
  inquiryStatusUpdateSchema,
  validateInquirySubmission
};
