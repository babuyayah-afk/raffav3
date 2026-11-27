'use strict';

function unwrap(operation, result) {
  if (result.error) {
    const error = new Error(`Supabase ${operation} failed: ${result.error.message}`);
    error.cause = result.error;
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

function createInquiryRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new TypeError('An administrative Supabase client is required.');
  }

  return Object.freeze({
    storage: client.storage,

    async createInquiry(record) {
      return unwrap('create inquiry', await client.rpc('submit_public_inquiry', {
        p_id: record.id,
        p_type: record.type,
        p_name: record.name,
        p_email: record.email,
        p_phone: record.phone,
        p_message: record.message,
        p_details: record.details,
        p_source: record.source,
        p_attachments: record.attachments,
        p_recipients: record.recipients
      }));
    },

    async listInquiries(filters) {
      return unwrap('list inquiries', await client.rpc('list_admin_inquiries', {
        p_actor_user_id: filters.actorId,
        p_search: filters.q || null,
        p_type: filters.type || null,
        p_status: filters.status || null,
        p_from: filters.from || null,
        p_to: filters.to || null,
        p_assignee: filters.assignee || null,
        p_sort: filters.sort,
        p_direction: filters.direction,
        p_page: filters.page,
        p_limit: filters.limit,
        p_follow_up_days: filters.followUpDays
      }));
    },

    async getInquiry(id) {
      const inquiryResult = await client.from('inquiries')
        .select('*, customer:customers(id,display_name,email,phone)')
        .eq('id', id)
        .maybeSingle();
      const inquiry = unwrap('read inquiry', inquiryResult);
      if (!inquiry) return null;

      const [activityResult, attachmentResult] = await Promise.all([
        client.from('inquiry_activity')
          .select('id,actor_user_id,activity_type,content,metadata,created_at')
          .eq('inquiry_id', id)
          .order('created_at', { ascending: true }),
        client.from('inquiry_attachments')
          .select('id,storage_path,file_name,content_type,file_size_bytes,alt_text')
          .eq('inquiry_id', id)
          .order('created_at', { ascending: true })
      ]);
      inquiry.activity = unwrap('read inquiry activity', activityResult) || [];
      inquiry.attachments = unwrap('read inquiry attachments', attachmentResult) || [];
      const actorIds = [...new Set(inquiry.activity.map((item) => item.actor_user_id).filter(Boolean))];
      if (actorIds.length) {
        const actorResult = await client.from('admin_profiles')
          .select('id,display_name')
          .in('id', actorIds);
        const actors = unwrap('read inquiry activity actors', actorResult) || [];
        const names = new Map(actors.map((actor) => [actor.id, actor.display_name]));
        inquiry.activity = inquiry.activity.map((item) => ({
          ...item,
          actor_name: names.get(item.actor_user_id) || null
        }));
      }

      inquiry.attachments = await Promise.all(inquiry.attachments.map(async (attachment) => {
        const signed = await client.storage.from('inquiry-references')
          .createSignedUrl(attachment.storage_path, 300);
        const signedData = unwrap('sign inquiry attachment URL', signed);
        return { ...attachment, signedUrl: signedData.signedUrl };
      }));

      const assignee = inquiry.assignee_id
        ? await client.from('admin_profiles')
          .select('id,display_name')
          .eq('id', inquiry.assignee_id)
          .maybeSingle()
        : { data: null, error: null };
      inquiry.assignee = unwrap('read inquiry assignee', assignee);

      const readResult = await client.from('inquiries')
        .update({ is_read: true })
        .eq('id', id)
        .eq('is_read', false);
      unwrap('mark inquiry read', readResult);
      return inquiry;
    },

    async updateInquiry(record) {
      return unwrap('update inquiry', await client.rpc('update_admin_inquiry', {
        p_actor_user_id: record.actorId,
        p_inquiry_id: record.inquiryId,
        p_status: record.status || null,
        p_reason: record.reason || null,
        p_assignee_id: record.assigneeId || null,
        p_assignee_set: record.assigneeSet
      }));
    },

    async addNote(record) {
      return unwrap('add inquiry note', await client.rpc('add_admin_inquiry_note', {
        p_actor_user_id: record.actorId,
        p_inquiry_id: record.inquiryId,
        p_note: record.note
      }));
    },

    async listAssignees() {
      const result = await client.from('admin_profiles')
        .select('id,display_name,role_key')
        .eq('is_active', true)
        .neq('role_key', 'viewer')
        .order('display_name');
      return unwrap('list inquiry assignees', result) || [];
    },

    async listReplyTemplates(type) {
      let query = client.from('reply_templates')
        .select('id,name,subject,body,inquiry_type')
        .eq('is_active', true)
        .order('name');
      if (type) query = query.in('inquiry_type', [type, 'general']);
      return unwrap('list reply templates', await query) || [];
    },

    async getPendingNotifications(limit = 10) {
      const result = await client.from('inquiry_notification_outbox')
        .select('id,inquiry_id,recipients,attempts')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .order('created_at')
        .limit(limit);
      return unwrap('read inquiry notification queue', result) || [];
    },

    async getNotificationInquiry(id) {
      const result = await client.from('inquiries')
        .select('id,type,name,email,phone,message,details,created_at')
        .eq('id', id)
        .maybeSingle();
      return unwrap('read inquiry notification data', result);
    },

    async markNotificationSent(id) {
      unwrap('mark inquiry notification sent', await client.from('inquiry_notification_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
        .eq('id', id));
    },

    async markNotificationRetry(id, attempts, error) {
      const delayMs = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.min(attempts, 7)));
      unwrap('schedule inquiry notification retry', await client.from('inquiry_notification_outbox')
        .update({
          attempts,
          last_error: String(error.message || 'Email delivery failed').slice(0, 500),
          next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
          status: attempts >= 10 ? 'failed' : 'pending'
        })
        .eq('id', id));
    },

    async markFollowupReminder(id) {
      return unwrap('record inquiry follow-up reminder', await client.rpc('mark_inquiry_followup_reminder', {
        p_inquiry_id: id,
        p_follow_up_days: Number(process.env.INQUIRY_FOLLOW_UP_DAYS || 3)
      }));
    },

    async listDueFollowups(days) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const result = await client.from('inquiries')
        .select('id')
        .in('status', ['new', 'contacted', 'quote_sent'])
        .lte('last_activity_at', cutoff)
        .is('follow_up_notified_at', null)
        .limit(100);
      return unwrap('list due inquiry follow-ups', result) || [];
    }
  });
}

module.exports = { createInquiryRepository };
