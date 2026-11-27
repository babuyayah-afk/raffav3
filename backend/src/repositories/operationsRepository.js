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

function pageRange({ page, limit }) {
  const start = (page - 1) * limit;
  return { start, end: start + limit - 1 };
}

function createOperationsRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function') {
    throw new TypeError('An administrative Supabase client is required.');
  }

  async function getBooking(id) {
    const bookingResult = await client.from('bookings')
      .select('*,customer:customers(id,display_name,email,phone)')
      .eq('id', id)
      .maybeSingle();
    const booking = unwrap('read booking', bookingResult);
    if (!booking) return null;
    const paymentsResult = await client.from('booking_payments')
      .select('id,payment_type,amount_minor,currency,method,reference,received_at,recorded_by')
      .eq('booking_id', id)
      .order('received_at', { ascending: true });
    booking.payments = unwrap('read booking payments', paymentsResult) || [];
    booking.paid_total_minor = booking.payments.reduce((total, payment) =>
      total + Number(payment.amount_minor), 0);
    booking.balance_due_minor = Math.max(
      Number(booking.agreed_price_minor) - booking.paid_total_minor, 0
    );
    return booking;
  }

  return Object.freeze({
    async listCustomers({ q, page, limit }) {
      const { start, end } = pageRange({ page, limit });
      let query = client.from('customers')
        .select('id,display_name,email,phone,notes,created_at,updated_at', { count: 'exact' })
        .is('archived_at', null)
        .order('display_name')
        .range(start, end);
      if (q) query = query.or(
        `display_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
      );
      const result = await query;
      return {
        items: unwrap('list customers', result) || [],
        total: result.count || 0
      };
    },

    async getCustomer(id) {
      const customerResult = await client.from('customers')
        .select('id,display_name,email,phone,notes,created_at,updated_at')
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle();
      const customer = unwrap('read customer', customerResult);
      if (!customer) return null;
      const [inquiriesResult, quotesResult, bookingsResult] = await Promise.all([
        client.from('inquiries')
          .select('id,type,status,created_at,updated_at,message,details')
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
        client.from('quotes')
          .select('id,quote_number,status,currency,total_minor,valid_until,created_at')
          .eq('customer_id', id)
          .is('archived_at', null)
          .order('created_at', { ascending: false }),
        client.from('bookings')
          .select('id,service_type,booking_date,start_time,end_time,venue_address,package_name,agreed_price_minor,currency,status')
          .eq('customer_id', id)
          .order('booking_date', { ascending: false })
      ]);
      customer.inquiries = unwrap('read customer inquiries', inquiriesResult) || [];
      customer.quotes = unwrap('read customer quotes', quotesResult) || [];
      customer.bookings = unwrap('read customer bookings', bookingsResult) || [];

      const bookingIds = customer.bookings.map((booking) => booking.id);
      if (bookingIds.length) {
        const paymentsResult = await client.from('booking_payments')
          .select('booking_id,amount_minor')
          .in('booking_id', bookingIds);
        const payments = unwrap('read customer booking payments', paymentsResult) || [];
        const paidByBooking = new Map();
        payments.forEach((payment) => {
          paidByBooking.set(
            payment.booking_id,
            (paidByBooking.get(payment.booking_id) || 0) + Number(payment.amount_minor)
          );
        });
        customer.bookings = customer.bookings.map((booking) => {
          const paid = paidByBooking.get(booking.id) || 0;
          return {
            ...booking,
            paid_total_minor: paid,
            balance_due_minor: Math.max(Number(booking.agreed_price_minor) - paid, 0)
          };
        });
      }
      return customer;
    },

    async saveCustomer(actorId, id, customer, requestId) {
      return unwrap('save customer', await client.rpc('save_admin_customer', {
        p_actor_user_id: actorId,
        p_customer_id: id || null,
        p_display_name: customer.displayName,
        p_email: customer.email,
        p_phone: customer.phone,
        p_notes: customer.notes,
        p_request_id: requestId || null
      }));
    },

    async listQuotes({ status, page, limit }) {
      const { start, end } = pageRange({ page, limit });
      let query = client.from('quotes')
        .select('id,quote_number,customer_id,inquiry_id,status,currency,subtotal_minor,total_minor,valid_until,notes,created_at,updated_at,customer:customers(display_name,email)', { count: 'exact' })
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .range(start, end);
      if (status) query = query.eq('status', status);
      const result = await query;
      return {
        items: unwrap('list quotes', result) || [],
        total: result.count || 0
      };
    },

    async getQuote(id) {
      const quoteResult = await client.from('quotes')
        .select('*,customer:customers(id,display_name,email,phone)')
        .eq('id', id)
        .is('archived_at', null)
        .maybeSingle();
      const quote = unwrap('read quote', quoteResult);
      if (!quote) return null;
      const itemsResult = await client.from('quote_items')
        .select('id,position,description,quantity,unit_price_minor,line_total_minor')
        .eq('quote_id', id)
        .order('position');
      quote.items = unwrap('read quote items', itemsResult) || [];
      return quote;
    },

    async saveQuote(actorId, id, quote, requestId) {
      const saved = unwrap('save quote', await client.rpc('save_admin_quote', {
        p_actor_user_id: actorId,
        p_quote_id: id || null,
        p_customer_id: quote.customerId,
        p_inquiry_id: quote.inquiryId || null,
        p_valid_until: quote.validUntil || null,
        p_notes: quote.notes,
        p_items: quote.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor
        })),
        p_request_id: requestId || null
      }));
      return this.getQuote(saved.id);
    },

    async setQuoteStatus(actorId, id, status, requestId) {
      unwrap('change quote status', await client.rpc('set_admin_quote_status', {
        p_actor_user_id: actorId,
        p_quote_id: id,
        p_status: status,
        p_request_id: requestId || null
      }));
      return this.getQuote(id);
    },

    async listBookings({ status, from, to, q, page, limit }) {
      const { start, end } = pageRange({ page, limit });
      let query = client.from('bookings')
        .select('id,customer_id,source_inquiry_id,service_type,booking_date,start_time,end_time,venue_address,package_name,agreed_price_minor,currency,status,notes,created_at,customer:customers(display_name,email,phone)', { count: 'exact' })
        .order('booking_date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(start, end);
      if (status) query = query.eq('status', status);
      if (from) query = query.gte('booking_date', from);
      if (to) query = query.lte('booking_date', to);
      if (q) query = query.or(`package_name.ilike.%${q}%,venue_address.ilike.%${q}%`);
      const result = await query;
      const items = unwrap('list bookings', result) || [];
      const bookingIds = items.map((booking) => booking.id);
      if (bookingIds.length) {
        const paymentResult = await client.from('booking_payments')
          .select('booking_id,amount_minor')
          .in('booking_id', bookingIds);
        const payments = unwrap('read booking balances', paymentResult) || [];
        const paidByBooking = new Map();
        payments.forEach((payment) => {
          paidByBooking.set(
            payment.booking_id,
            (paidByBooking.get(payment.booking_id) || 0) + Number(payment.amount_minor)
          );
        });
        items.forEach((booking) => {
          const paid = paidByBooking.get(booking.id) || 0;
          booking.paid_total_minor = paid;
          booking.balance_due_minor = Math.max(Number(booking.agreed_price_minor) - paid, 0);
        });
      }
      return { items, total: result.count || 0 };
    },

    getBooking,

    async createBooking(actorId, booking, requestId) {
      return unwrap('create booking', await client.rpc('create_admin_booking', {
        p_actor_user_id: actorId,
        p_customer_id: booking.customerId,
        p_inquiry_id: null,
        p_service_type: booking.serviceType,
        p_booking_date: booking.bookingDate,
        p_start_time: booking.startTime || null,
        p_end_time: booking.endTime || null,
        p_venue_address: booking.venueAddress,
        p_package_name: booking.packageName,
        p_agreed_price_minor: booking.agreedPriceMinor,
        p_status: booking.status,
        p_notes: booking.notes,
        p_override_reason: booking.overrideReason || null,
        p_request_id: requestId || null
      }));
    },

    async createBookingFromInquiry(actorId, inquiryId, booking, requestId) {
      return unwrap('convert inquiry to booking', await client.rpc('create_admin_booking', {
        p_actor_user_id: actorId,
        p_customer_id: null,
        p_inquiry_id: inquiryId,
        p_service_type: null,
        p_booking_date: booking.bookingDate,
        p_start_time: booking.startTime || null,
        p_end_time: booking.endTime || null,
        p_venue_address: booking.venueAddress,
        p_package_name: booking.packageName,
        p_agreed_price_minor: booking.agreedPriceMinor,
        p_status: booking.status,
        p_notes: booking.notes,
        p_override_reason: booking.overrideReason || null,
        p_request_id: requestId || null
      }));
    },

    async updateBooking(actorId, id, booking, requestId) {
      return unwrap('update booking', await client.rpc('update_admin_booking', {
        p_actor_user_id: actorId,
        p_booking_id: id,
        p_booking_date: booking.bookingDate,
        p_start_time: booking.startTime || null,
        p_end_time: booking.endTime || null,
        p_venue_address: booking.venueAddress,
        p_package_name: booking.packageName,
        p_agreed_price_minor: booking.agreedPriceMinor,
        p_status: booking.status,
        p_notes: booking.notes,
        p_override_reason: booking.overrideReason || null,
        p_request_id: requestId || null
      }));
    },

    async recordPayment(actorId, bookingId, payment, requestId) {
      unwrap('record booking payment', await client.rpc('record_admin_booking_payment', {
        p_actor_user_id: actorId,
        p_booking_id: bookingId,
        p_payment_type: payment.paymentType,
        p_amount_minor: payment.amountMinor,
        p_method: payment.method,
        p_reference: payment.reference,
        p_received_at: payment.receivedAt || null,
        p_request_id: requestId || null
      }));
      return getBooking(bookingId);
    },

    async getCapacity() {
      const result = await client.from('site_settings')
        .select('value_json,updated_at')
        .eq('setting_key', 'dessert_daily_capacity')
        .maybeSingle();
      const setting = unwrap('read dessert capacity', result);
      return {
        limit: setting?.value_json?.limit ?? null,
        updatedAt: setting?.updated_at || null
      };
    },

    async setCapacity(actorId, limit, requestId) {
      const result = await client.rpc('set_dessert_daily_capacity', {
        p_actor_user_id: actorId,
        p_limit: limit,
        p_request_id: requestId || null
      });
      return unwrap('update dessert capacity', result)?.value_json;
    },

    async getSummary(actorId) {
      return unwrap('read operations summary', await client.rpc('get_admin_operations_summary', {
        p_actor_user_id: actorId
      }));
    }
  });
}

module.exports = { createOperationsRepository };
