'use strict';

const STORAGE_BUCKET = 'showcase-media';
const ITEM_FIELDS = [
  'id', 'content_type', 'slug', 'title', 'summary', 'body', 'details',
  'image_asset_id', 'status', 'is_visible', 'is_featured', 'display_order',
  'created_at', 'updated_at', 'archived_at', 'draft_data'
].join(',');
const PUBLIC_ITEM_FIELDS = ITEM_FIELDS.split(',')
  .filter((field) => field !== 'draft_data')
  .join(',');
const MEDIA_FIELDS = [
  'id', 'storage_path', 'original_name', 'content_type', 'file_size_bytes',
  'alt_text', 'created_at', 'archived_at'
].join(',');

function unwrap(operation, result) {
  if (result.error) {
    const error = new Error(`Supabase ${operation} failed: ${result.error.message}`);
    error.cause = result.error;
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

function exposeDraft(item) {
  if (!item?.draft_data) return item;
  return {
    ...item,
    ...item.draft_data,
    id: item.id,
    status: 'draft',
    published_status: item.status,
    has_draft: true,
    draft_data: undefined
  };
}

function createShowcaseRepository(client) {
  if (!client || typeof client.from !== 'function' || typeof client.rpc !== 'function' ||
      typeof client.storage?.from !== 'function') {
    throw new TypeError('A Supabase client with database and storage access is required.');
  }

  async function signedUrls(storagePaths) {
    if (!storagePaths.length) return new Map();
    const result = await client.storage.from(STORAGE_BUCKET)
      .createSignedUrls(storagePaths, 3600);
    const entries = unwrap('create showcase media URLs', result) || [];
    const failures = entries.filter((entry) => entry.error);
    if (failures.length) {
      throw new Error(`Supabase could not sign ${failures.length} showcase media URL(s).`);
    }
    return new Map(entries.map((entry) => [entry.path, entry.signedUrl]));
  }

  async function withSignedImages(items) {
    const assetIds = [...new Set(items.map((item) => item.image_asset_id).filter(Boolean))];
    if (!assetIds.length) {
      return items.map((item) => ({ ...item, image_url: '', image_alt: '' }));
    }
    const result = await client.from('media_assets')
      .select('id,storage_path,alt_text')
      .in('id', assetIds)
      .is('archived_at', null);
    const assets = unwrap('read showcase image metadata', result) || [];
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    const urls = await signedUrls([...new Set(assets.map((asset) => asset.storage_path))]);
    return items.map((item) => {
      const asset = assetById.get(item.image_asset_id);
      return {
        ...item,
        image_url: asset ? urls.get(asset.storage_path) || '' : '',
        image_alt: asset?.alt_text || ''
      };
    });
  }

  return Object.freeze({
    async listItems({ type, status, search, page, limit }) {
      let query = client.from('showcase_items')
        .select(ITEM_FIELDS, { count: 'exact' })
        .is('archived_at', null)
        .order('display_order')
        .order('created_at', { ascending: false });
      if (type) query = query.eq('content_type', type);
      if (status === 'draft') query = query.or('status.eq.draft,draft_data.not.is.null');
      if (status === 'published') query = query.eq('status', 'published');
      if (search) query = query.ilike('title', `%${search}%`);
      const start = (page - 1) * limit;
      const result = await query.range(start, start + limit - 1);
      const items = unwrap('list showcase items', result) || [];
      return {
        items: await withSignedImages(items.map((item) =>
          status === 'published' ? item : exposeDraft(item))),
        total: result.count || 0
      };
    },

    async saveItem(actorId, item, requestId) {
      const result = await client.rpc('save_showcase_item', {
        p_actor_user_id: actorId,
        p_item_id: item.id || null,
        p_content_type: item.type,
        p_slug: item.slug,
        p_title: item.title,
        p_summary: item.summary,
        p_body: item.body,
        p_details: item.details,
        p_image_asset_id: item.imageAssetId || null,
        p_status: item.status,
        p_is_visible: item.isVisible,
        p_is_featured: item.isFeatured,
        p_display_order: item.displayOrder,
        p_request_id: requestId || null
      });
      const [savedItem] = await withSignedImages([exposeDraft(unwrap('save showcase item', result))]);
      return savedItem;
    },

    async archiveItem(actorId, id, requestId) {
      const result = await client.rpc('archive_showcase_item', {
        p_actor_user_id: actorId,
        p_item_id: id,
        p_request_id: requestId || null
      });
      return unwrap('archive showcase item', result);
    },

    async listSections() {
      const result = await client.from('site_sections')
        .select('section_key,title,display_order,is_visible,updated_at')
        .order('display_order')
        .order('section_key');
      return unwrap('list homepage sections', result) || [];
    },

    async saveSections(actorId, sections, requestId) {
      const result = await client.rpc('set_site_sections', {
        p_actor_user_id: actorId,
        p_sections: sections,
        p_request_id: requestId || null
      });
      return unwrap('save homepage sections', result) || [];
    },

    async uploadAsset(actorId, image, altText, requestId) {
      const uploaded = await client.storage.from(STORAGE_BUCKET).upload(
        image.fileName,
        image.buffer,
        { contentType: image.contentType, cacheControl: '31536000', upsert: false }
      );
      unwrap('upload showcase image', uploaded);
      let asset;
      try {
        const registered = await client.rpc('register_showcase_media', {
          p_actor_user_id: actorId,
          p_storage_path: image.fileName,
          p_original_name: image.originalName,
          p_file_size_bytes: image.buffer.length,
          p_alt_text: altText,
          p_request_id: requestId || null
        });
        asset = unwrap('register showcase image', registered);
      } catch (error) {
        let cleanupFailure = null;
        try {
          const removed = await client.storage.from(STORAGE_BUCKET).remove([image.fileName]);
          cleanupFailure = removed.error;
        } catch (removeError) {
          cleanupFailure = removeError;
        }
        if (cleanupFailure) {
          const cleanupError = new Error(
            `${error.message} Uploaded image cleanup failed: ${cleanupFailure.message}`
          );
          cleanupError.cause = error;
          cleanupError.cleanupError = cleanupFailure;
          throw cleanupError;
        }
        throw error;
      }
      return { ...asset, usage: [] };
    },

    async listAssets({ search, page, limit }) {
      let query = client.from('media_assets')
        .select(MEDIA_FIELDS, { count: 'exact' })
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (search) query = query.ilike('original_name', `%${search}%`);
      const start = (page - 1) * limit;
      const result = await query.range(start, start + limit - 1);
      const assets = unwrap('list showcase media', result) || [];
      const usageResult = assets.length
        ? await client.from('media_asset_usage')
          .select('asset_id,entity_type,entity_id')
          .in('asset_id', assets.map((asset) => asset.id))
        : { data: [], error: null };
      const usage = unwrap('read showcase media usage', usageResult) || [];
      const usageByAsset = new Map();
      usage.forEach((entry) => {
        const entries = usageByAsset.get(entry.asset_id) || [];
        entries.push({ type: entry.entity_type, id: entry.entity_id });
        usageByAsset.set(entry.asset_id, entries);
      });
      const urls = await signedUrls([...new Set(assets.map((asset) => asset.storage_path))]);
      return {
        items: assets.map((asset) => ({
          ...asset,
          image_url: urls.get(asset.storage_path) || '',
          usage: usageByAsset.get(asset.id) || []
        })),
        total: result.count || 0
      };
    },

    async updateAsset(actorId, id, altText, archive, requestId) {
      const result = await client.rpc('update_showcase_media', {
        p_actor_user_id: actorId,
        p_asset_id: id,
        p_alt_text: altText,
        p_archive: archive,
        p_request_id: requestId || null
      });
      const asset = unwrap('update showcase media', result);
      return archive ? asset : { ...asset, usage: [] };
    },

    async getPublicItems(type) {
      const result = await client.from('showcase_items')
        .select(PUBLIC_ITEM_FIELDS)
        .eq('content_type', type)
        .eq('status', 'published')
        .eq('is_visible', true)
        .is('archived_at', null)
        .order('display_order')
        .order('created_at', { ascending: false })
        .limit(100);
      const items = unwrap(`read published ${type}`, result) || [];
      return withSignedImages(items);
    }
  });
}

module.exports = { createShowcaseRepository, STORAGE_BUCKET };
