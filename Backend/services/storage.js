// Backend/services/storage.js
// Uploads files to Supabase Storage. Vercel's serverless runtime has a
// read-only filesystem, so uploads MUST go to Supabase Storage on Vercel.
// Falls back to local disk uploads/ only when running locally.

const fs = require('fs');
const path = require('path');

const IS_VERCEL = !!process.env.VERCEL;

function getSupabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key);
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';

function assertSupabaseConfigured() {
    if (IS_VERCEL) {
        throw new Error(
            'Supabase Storage is not configured. On Vercel, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel -> Project -> Settings -> Environment Variables, then redeploy.'
        );
    }
}

// Uploads a file buffer to Supabase Storage, returns a public URL.
async function uploadBuffer(buffer, folder, filename, contentType) {
    const supabase = getSupabase();
    if (supabase) {
        const { data: buckets } = await supabase.storage.listBuckets();
        if (!buckets || !buckets.some(b => b.name === BUCKET)) {
            const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: true });
            if (createError && !String(createError.message || '').toLowerCase().includes('already exists')) {
                throw new Error('Could not create uploads bucket: ' + createError.message);
            }
        }
        const bucket = supabase.storage.from(BUCKET);
        const safeName = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + path.extname(filename || '.bin');
        const storagePath = `${folder}/${safeName}`;
        const { error } = await bucket.upload(storagePath, buffer, {
            contentType: contentType || 'application/octet-stream',
            upsert: false
        });
        if (error) throw new Error(error.message);
        const { data } = bucket.getPublicUrl(storagePath);
        return data.publicUrl;
    }

    assertSupabaseConfigured();

    // Local fallback (development only)
    const dir = path.join(__dirname, '..', '..', 'uploads', folder);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = Date.now() + '-' + Math.random().toString(36).substring(2, 8) + path.extname(filename || '.bin');
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, buffer);
    return '/uploads/' + folder + '/' + safeName;
}

module.exports = { uploadBuffer, getSupabase };
