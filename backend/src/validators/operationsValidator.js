'use strict';

const { z } = require('zod');

const nullableText = (max) => z.union([
  z.string().trim().max(max),
  z.null()
]).optional();
const safeText = (max) => z.string().max(max).refine(
  (value) => !value.includes('\u0000'),
  'Text must not contain a null character.'
);
const searchText = z.string().trim().max(100).refine(
  (value) => !/[%_*(),]/.test(value),
  'Search contains unsupported characters.'
).default('');
const date = z.string().date();
const uuid = z.string().uuid();
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(
  timePattern,
  'Enter a valid time between 00:00 and 23:59.'
);
const sameDayTimeRangeMessage =
  'Choose a time later than the start time on the selected date. Overnight bookings are not supported.';
const hasValidSameDayTimeRange = (value) =>
  !value.startTime || !value.endTime ||
  !timePattern.test(value.startTime) || !timePattern.test(value.endTime) ||
  value.endTime > value.startTime;

const listQuery = z.object({
  q: searchText.optional(),
  status: z.string().trim().max(30).optional(),
  from: date.optional(),
  to: date.optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25)
}).strict().refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be earlier than or equal to to.',
  path: ['from']
});

const customerSchema = z.object({
  displayName: safeText(100).trim().min(2),
  email: nullableText(254).transform((value) => {
    if (value === undefined || value === null || value === '') return null;
    return value.toLowerCase();
  }).refine((value) => value === null || z.string().email().safeParse(value).success, {
    message: 'Enter a valid email address.'
  }),
  phone: nullableText(30).transform((value) => value === '' ? null : value),
  notes: safeText(5000).default('')
}).strict();

const quoteItemSchema = z.object({
  description: safeText(300).trim().min(1),
  quantity: z.number().int().min(1).max(10000),
  unitPriceMinor: z.number().int().min(0).max(100000000)
}).strict();

const quoteSchema = z.object({
  customerId: uuid,
  inquiryId: uuid.nullable().optional(),
  validUntil: date.nullable().optional(),
  notes: safeText(5000).default(''),
  items: z.array(quoteItemSchema).min(1).max(50)
}).strict();

const quoteStatusSchema = z.object({
  status: z.enum(['sent', 'accepted', 'declined', 'expired'])
}).strict();

const bookingFields = {
  bookingDate: date,
  startTime: z.union([time, z.null()]).optional(),
  endTime: z.union([time, z.null()]).optional(),
  venueAddress: safeText(500).default(''),
  packageName: safeText(160).default(''),
  agreedPriceMinor: z.number().int().min(0).max(1000000000000),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled']).default('confirmed'),
  notes: safeText(5000).default(''),
  overrideReason: safeText(500).trim().min(1).optional()
};

const bookingSchema = z.object({
  ...bookingFields,
  customerId: uuid,
  serviceType: z.enum(['events', 'desserts'])
}).strict().refine(hasValidSameDayTimeRange, {
  message: sameDayTimeRangeMessage,
  path: ['endTime']
});

const bookingFromInquirySchema = z.object(bookingFields).strict().refine(hasValidSameDayTimeRange, {
  message: sameDayTimeRangeMessage,
  path: ['endTime']
});

const paymentSchema = z.object({
  paymentType: z.enum(['deposit', 'balance', 'other']),
  amountMinor: z.number().int().min(1).max(1000000000000),
  method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'card', 'other']),
  reference: safeText(160).default(''),
  receivedAt: z.string().datetime({ offset: true }).optional()
}).strict();

const capacitySchema = z.object({
  limit: z.number().int().min(1).max(1000).nullable()
}).strict();

function parse(schema, value) {
  const result = schema.safeParse(value);
  return result.success
    ? { value: result.data }
    : { errors: result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    })) };
}

module.exports = {
  parseBooking: (value) => parse(bookingSchema, value),
  parseBookingFromInquiry: (value) => parse(bookingFromInquirySchema, value),
  parseCapacity: (value) => parse(capacitySchema, value),
  parseCustomer: (value) => parse(customerSchema, value),
  parseListQuery: (value) => parse(listQuery, value),
  parsePayment: (value) => parse(paymentSchema, value),
  parseQuote: (value) => parse(quoteSchema, value),
  parseQuoteStatus: (value) => parse(quoteStatusSchema, value),
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};
