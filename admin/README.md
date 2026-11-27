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
