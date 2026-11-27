const fs = require('node:fs');
const path = require('node:path');

// Prepares the admin UI for the admin Netlify site (base directory: admin).
// The admin pages reference their assets under /admin/, so they are published
// to dist/admin/ and the site root redirects there.
const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'dist');
const adminOutputDirectory = path.join(outputDirectory, 'admin');
const publicFiles = [
  'index.html',
  'login.html',
  'login.css',
  'login.js',
  'dashboard.css',
  'dashboard.js',
  'inbox.css',
  'inbox.js',
  'website-content.css',
  'website-content.js',
  'showcase-admin.css',
  'showcase-admin.js',
  'user-management.css',
  'user-management.js',
  'operations.css',
  'operations.js',
  'admin-step-up.js',
  'testimonial-admin.js'
];

function getApiBase() {
  const configured = (process.env.RAFA_API_BASE || '').trim();
  if (!configured) return '';

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('RAFA_API_BASE must be an HTTP(S) API origin.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.pathname !== '/' ||
      parsed.search || parsed.hash ||
      ![parsed.origin, `${parsed.origin}/`].includes(configured)) {
    throw new Error('RAFA_API_BASE must be an HTTP(S) API origin without a path, credentials, query, or fragment.');
  }
  return parsed.origin;
}

const apiBase = getApiBase();
const apiBaseMeta = /<meta\s+name=["']rafa-api-base["']\s+content=["'][^"']*["']\s*\/?>/i;

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(adminOutputDirectory, { recursive: true });

for (const file of publicFiles) {
  const source = path.join(root, file);
  const destination = path.join(adminOutputDirectory, file);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Expected a file to publish: ${source}`);
  }
  if (path.extname(file).toLowerCase() === '.html') {
    const html = fs.readFileSync(source, 'utf8');
    if (!apiBaseMeta.test(html)) {
      throw new Error(`Expected a rafa-api-base meta tag in: ${source}`);
    }
    fs.writeFileSync(
      destination,
      html.replace(apiBaseMeta, `<meta name="rafa-api-base" content="${apiBase}">`),
      'utf8'
    );
  } else {
    fs.copyFileSync(source, destination);
  }
}

fs.writeFileSync(
  path.join(outputDirectory, '_redirects'),
  '/ /admin/ 302\n',
  'utf8'
);

console.log('Prepared admin UI in dist/admin/.');
