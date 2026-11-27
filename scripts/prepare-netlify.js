const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontendDirectory = path.join(root, 'frontend');
const outputDirectory = path.join(root, 'dist');
const publicFiles = [
  'index.html',
  'apparels.html',
  'cart.html',
  'contact.html',
  'assets/styles/header.css',
  'assets/styles/footer.css',
  'assets/styles/index.css',
  'assets/styles/apparels.css',
  'assets/styles/public-mobile.css',
  'assets/styles/shared-shell.css',
  'assets/styles/elan-theme.css',
  'assets/styles/cart-page.css',
  'assets/styles/contact.css',
  'assets/js/shared-shell.js',
  'assets/js/currency.js',
  'assets/js/media.js',
  'assets/js/heroMedia.js',
  'assets/js/header.js',
  'assets/js/public-mobile.js',
  'assets/js/apparelCart.js',
  'assets/js/siteContent.js',
  'assets/js/publicContent.js',
  'assets/js/apparel.js',
  'assets/js/contact.js',
  'assets/media/desserts-optimized.mp4',
  'assets/media/events-optimized.mp4',
  'assets/media/events1-optimized.mp4',
  'assets/media/dessert-poster-optimized.jpg',
  'assets/js/footer.js'
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

function copyFiles(sourceDirectory, destinationDirectory, files) {
  for (const file of files) {
    const source = path.join(sourceDirectory, file);
    const destination = path.join(destinationDirectory, file);
    if (!fs.statSync(source).isFile()) {
      throw new Error(`Expected a file to publish: ${source}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (path.extname(file).toLowerCase() === '.html') {
      const html = fs.readFileSync(source, 'utf8');
      const apiBaseMeta = /<meta\s+name=["']rafa-api-base["']\s+content=["'][^"']*["']\s*\/?>/i;
      if (!apiBaseMeta.test(html)) {
        throw new Error(`Expected an rafa-api-base meta tag in: ${source}`);
      }
      const configuredHtml = html.replace(
        apiBaseMeta,
        `<meta name="rafa-api-base" content="${apiBase}">`
      );
      fs.writeFileSync(destination, configuredHtml, 'utf8');
    } else {
      fs.copyFileSync(source, destination);
    }
  }
}

const apiBase = getApiBase();
if (path.dirname(outputDirectory) !== root) {
  throw new Error('Netlify output directory must remain inside the project root.');
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
copyFiles(frontendDirectory, outputDirectory, publicFiles);
fs.writeFileSync(
  path.join(outputDirectory, '_redirects'),
  '/admin / 302\n/admin/* / 302\n/admin.html / 302\n/events.html /#work 301\n/event-gallery.html /#work 301\n/desserts.html /contact.html?topic=desserts 301\n',
  'utf8'
);

console.log('Prepared public site in dist/. Admin UI is temporarily unpublished.');
