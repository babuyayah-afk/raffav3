# RAFA Events Admin

The recovered `index.html` opens directly on the dashboard. Website Content
and CMS have separate sidebar entries. Website Content edits homepage page
text; CMS manages structured showcase entries, section settings, media, and
testimonial review. Protected changes use the backend's admin session and MFA
flow. The production build still excludes the admin folder.

Use the header's "Aa" control to scale the admin interface from 80% to 130%.
The selected size is saved in browser storage and can be reset to 100%.

The Website Content area supports staged drafts and publishing for editable
homepage page text. The separate CMS area handles dessert/event packages,
portfolio entries, FAQs, homepage section visibility/order, and private image
uploads with alternative text and usage information. Draft previews are
private until published. The Apparels area edits the apparel catalogue and
newsletter copy. Visitors can submit testimonials with consent; authenticated
owners or managers approve or reject them in CMS. Only approved testimonials
appear on the public homepage. These tools require the Stage 3 Supabase
migration described in the [backend setup guide](../backend/README.md); the
migration has not been applied to the hosted project.

The dashboard's remaining analytics pages are UI previews with sample data.
See the [dashboard implementation guide](./ADMIN-IMPLEMENTATION-GUIDE.md).

## Separate Netlify admin site

The admin UI is static; authentication and data APIs run on the Express backend. For a separate Netlify admin site, configure the site with base directory `admin`, build command `node scripts/prepare-netlify.js`, publish directory `dist` (relative to the base directory), and leave the Functions directory blank. Set the Netlify build environment variable `RAFA_API_PROXY_TARGET` to the deployed backend's HTTPS origin only, such as `https://api.example.com`. Do not include a path, credentials, query, or trailing route. The build creates a same-origin `/api/*` proxy so the browser's secure `SameSite=Strict` admin session cookie belongs to the Netlify admin site.

On the backend host, set `FRONTEND_ORIGINS` to include the exact admin site origin (for example, `https://your-admin-site.netlify.app`) and the public site origin if it calls the API directly. Keep `RAFA_API_BASE` unset for the admin Netlify site so it uses the same-origin proxy. Configure the public site's `RAFA_API_BASE` separately to the backend HTTPS origin for public inquiry requests. Store Supabase keys and encryption keys only in the backend host's secret settings, and use persistent storage for the backend's SQLite auth/session state. The admin build fails if `RAFA_API_PROXY_TARGET` is missing or invalid; deploy the backend first, then set the Netlify variable and redeploy the admin site.
