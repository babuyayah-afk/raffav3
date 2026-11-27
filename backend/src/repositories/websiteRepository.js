'use strict';

const REQUEST_TABLES = Object.freeze({
  'contact-inquiries': {
    table: 'contact_inquiries',
    columns: 'id,created_at,topic,customer_name,customer_email,customer_phone,details_json,status',
    statuses: new Set(['new', 'reviewed', 'responded', 'closed'])
  },
  'celebration-requests': {
    table: 'celebration_requests',
    columns: 'id,created_at,customer_name,customer_email,customer_phone,occasion,event_date,event_location,guest_count,budget,notes,selections_json,status',
    statuses: new Set(['new', 'reviewed', 'responded', 'closed'])
  },
  'order-requests': {
    table: 'order_requests',
    columns: 'id,created_at,customer_name,customer_email,customer_phone,preferred_date,notes,items_json,total,status',
    statuses: new Set(['pending', 'reviewed', 'preparing', 'ready', 'completed', 'cancelled'])
  },
  'newsletter-subscriptions': {
    table: 'newsletter_subscriptions',
    columns: 'id,created_at,email,status',
    statuses: new Set(['active', 'unsubscribed'])
  }
});

function unwrap(operation, result) {
  if (result.error) {
    const error = new Error(`Supabase ${operation} failed: ${result.error.message}`);
    error.cause = result.error;
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

function mapAdminRequest(recordType, row) {
  const { table } = REQUEST_TABLES[recordType];
  if (table === 'contact_inquiries') {
    const { created_at, customer_name, customer_email, customer_phone, details_json, ...item } = row;
    return {
      ...item,
      createdAt: created_at,
      name: customer_name,
      email: customer_email,
      phone: customer_phone,
      details: details_json
    };
  }
  if (table === 'celebration_requests') {
    const {
      created_at, customer_name, customer_email, customer_phone,
      event_date, event_location, guest_count, selections_json, ...item
    } = row;
    return {
      ...item,
      createdAt: created_at,
      name: customer_name,
      email: customer_email,
      phone: customer_phone,
      eventDate: event_date,
      location: event_location,
      guestCount: guest_count,
      selections: selections_json
    };
  }
  if (table === 'order_requests') {
    const {
      created_at, customer_name, customer_email, customer_phone,
      preferred_date, items_json, ...item
    } = row;
    return {
      ...item,
      createdAt: created_at,
      name: customer_name,
      email: customer_email,
      phone: customer_phone,
      preferredDate: preferred_date,
      items: items_json,
      total_is_estimate: true
    };
  }
  const { created_at, ...item } = row;
  return { ...item, createdAt: created_at };
}

function createWebsiteRepository(client) {
  if (!client || typeof client.from !== 'function') {
    throw new TypeError('A Supabase client is required.');
  }

  return Object.freeze({
    async checkConnection() {
      const result = await client.from('site_content')
        .select('content_key')
        .limit(1);
      unwrap('check website data connection', result);
    },

    async getPublicSiteContent() {
      const [contentResult, testimonialResult] = await Promise.all([
        client.from('site_content')
          .select('content_key,value_json')
          .order('content_key'),
        client.from('testimonials')
          .select('quote,customer_name,event_detail')
          .eq('status', 'approved')
          .order('reviewed_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(12)
      ]);
      const contentRows = unwrap('read site content', contentResult) || [];
      const testimonials = unwrap('read published testimonials', testimonialResult) || [];
      const content = Object.fromEntries(
        contentRows.map((row) => [row.content_key, row.value_json])
      );
      content['home.testimonials'] = testimonials.map((row) => ({
        quote: row.quote,
        name: row.customer_name,
        detail: row.event_detail
      }));
      return content;
    },

    async createOrderRequest(record) {
      const result = await client.from('order_requests')
        .insert(record)
        .select('id,created_at,total,status')
        .single();
      return unwrap('create order request', result);
    },

    async findCelebrationRequest(requestId) {
      const result = await client.from('celebration_requests')
        .select('id,created_at,status')
        .eq('request_id', requestId)
        .maybeSingle();
      return unwrap('find celebration request', result);
    },

    async createCelebrationRequest(record) {
      const result = await client.from('celebration_requests')
        .insert(record)
        .select('id,created_at,status')
        .single();
      return unwrap('create celebration request', result);
    },

    async createContactInquiry(record) {
      const result = await client.from('contact_inquiries')
        .insert(record)
        .select('id,created_at,status')
        .single();
      return unwrap('create contact inquiry', result);
    },

    async createTestimonial(record) {
      const result = await client.from('testimonials')
        .insert(record)
        .select('id,status')
        .single();
      return unwrap('create testimonial', result);
    },

    async subscribeNewsletter(record) {
      const result = await client.from('newsletter_subscriptions')
        .insert(record)
        .select('id,status')
        .single();
      if (!result.error) {
        return { ...result.data, duplicate: false };
      }
      if (result.error.code !== '23505') {
        unwrap('subscribe to newsletter', result);
      }
      const existing = await client.from('newsletter_subscriptions')
        .select('id')
        .eq('email', record.email)
        .maybeSingle();
      const existingRecord = unwrap('find existing newsletter subscription', existing);
      if (!existingRecord) {
        const error = new Error('Supabase reported a duplicate subscription but none could be found.');
        error.code = 'NEWSLETTER_DUPLICATE_NOT_FOUND';
        throw error;
      }
      return { id: existingRecord.id, status: 'active', duplicate: true };
    },

    async listTestimonials(status) {
      const result = await client.from('testimonials')
        .select('id,created_at,customer_name,quote,event_detail,status')
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(200);
      return (unwrap('list testimonials', result) || []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        name: row.customer_name,
        quote: row.quote,
        detail: row.event_detail,
        status: row.status
      }));
    },

    async reviewTestimonial(id, status, reviewerId, reviewedAt) {
      const result = await client.from('testimonials')
        .update({ status, reviewed_by: reviewerId || null, reviewed_at: reviewedAt })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id,status,reviewed_at')
        .maybeSingle();
      return unwrap('review testimonial', result);
    },

    async readEditableSiteContent() {
      const [contentResult, draftResult] = await Promise.all([
        client.from('site_content')
          .select('content_key,value_json,updated_at')
          .neq('content_key', 'home.testimonials')
          .order('content_key'),
        client.from('site_content_drafts')
          .select('content_key,value_json,updated_at')
          .order('content_key')
      ]);
      return {
        rows: unwrap('read editable site content', contentResult) || [],
        drafts: unwrap('read site content drafts', draftResult) || []
      };
    },

    async saveSiteContent(contentKey, value, updatedAt) {
      const result = await client.from('site_content')
        .upsert({
          content_key: contentKey,
          value_json: value,
          updated_at: updatedAt
        }, { onConflict: 'content_key' })
        .select('content_key,value_json,updated_at')
        .single();
      return unwrap('save site content', result);
    },

    async saveSiteContentState(actorId, contentKey, value, status, requestId) {
      const result = await client.rpc('save_site_content_state', {
        p_actor_user_id: actorId,
        p_content_key: contentKey,
        p_value_json: value,
        p_status: status,
        p_request_id: requestId || null
      });
      return unwrap('save site content state', result);
    },

    async listRequests(recordType) {
      const record = REQUEST_TABLES[recordType];
      if (!record) throw new RangeError(`Unsupported request type: ${recordType}`);
      const result = await client.from(record.table)
        .select(record.columns)
        .order('created_at', { ascending: false })
        .limit(200);
      return (unwrap(`list ${record.table}`, result) || [])
        .map((row) => mapAdminRequest(recordType, row));
    },

    async updateRequestStatus(recordType, id, status) {
      const record = REQUEST_TABLES[recordType];
      if (!record) throw new RangeError(`Unsupported request type: ${recordType}`);
      if (typeof status !== 'string' || !record.statuses.has(status)) return null;
      const result = await client.from(record.table)
        .update({ status })
        .eq('id', id)
        .select('id,status')
        .maybeSingle();
      return unwrap(`update ${record.table}`, result);
    }
  });
}

module.exports = { createWebsiteRepository };
