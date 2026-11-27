# Admin Implementation Guide

> The recovered `index.html` opens directly on the dashboard. Website Content
> and CMS are separate navigation entries. Website Content edits page text;
> CMS manages structured content, sections, media, and testimonial review.
> Protected changes use the backend's authenticated admin session and MFA.
> The production build excludes the admin folder.

This guide covers the sample-data dashboard screens, protected Website Content
page-text editing, the CMS for showcase entries, section settings, private
media, and testimonials, and the Apparels editor for product and newsletter
content. Page-text drafts do not affect the public site until published. Other
analytics and admin pages remain UI previews.

## Step 1: Make the Existing Dashboard Functional

Work in `index.html`, `dashboard.js`, and `dashboard.css`. Preserve the current
RaFFA ADmin dashboard appearance; do not redesign it during this step. Keep any
future screen styling consistent with the dashboard.

### Navigation

- Make each sidebar item open its own matching admin view instead of only
  showing a toast or changing its active style.
- Keep the active item in sync with the current view.
- Keep the dashboard toggle working on desktop and as a drawer on mobile.
- Make the RaFFA ADmin brand link return to the dashboard.

### Header controls

- Search should find relevant visible dashboard data and provide a clear
  empty-results state.
- The language selector should update the selected language indicator.
- The theme button should toggle the theme.
- The notification and profile buttons should open and close their menus;
  clicking outside a menu or pressing Escape should close it.
- The email control should open the messages view or a useful messages panel.
- The fullscreen button should enter and exit fullscreen, with a clear message
  if the browser blocks the request.

### Dashboard cards and actions

- Give every “View All” and “View Details” action a useful destination within
  the admin interface.
- Keep “Show More” and “Show Less” on Recent Activity working.
- Make chart controls perform their labeled action or clearly report when an
  action is not available.
- Give the Leads By Source menu a working menu with relevant actions.

### Deals table

- Search should filter all visible deal fields.
- Select individual rows and select/deselect all.
- Sorting should visibly change row order and identify its current direction.
- Previous, next, and page-number controls should navigate valid pages and be
  disabled when no page is available.
- Row actions should open useful deal details or editing controls.
- Keep the result count and selection state accurate after searching, sorting,
  or changing pages.

### Functional-step acceptance checks

- Every visible link and button has a defined, working result; remove misleading
  controls or disable them with an explanation if an action is intentionally
  unavailable.
- Active navigation, menus, search results, selection, sort direction, and
  pagination stay synchronized with the visible state.
- Keyboard focus is visible; menus and the mobile navigation can be closed
  with Escape.
- No dead links, JavaScript console errors, or unintended horizontal page
  overflow at desktop and mobile widths.
- Keep demo analytics pages disconnected from APIs and real customer data.
  Preserve the separate, authenticated testimonial review workflow.

## Step 2: Sample Admin Pages UI Prompt

The following prompt describes the UI-only sample screens and remains a
reference for keeping future changes within the intended scope. It applies to
the sample dashboard pages, not the authenticated content-management workflows.

Use the following prompt after Step 1 is complete:

> Build the admin pages and their content as a **UI-only** extension of the
> existing dashboard in `admin/index.html`.
>
> Preserve the current RaFFA ADmin dashboard's visual design, component styling,
> typography, colors, spacing, responsive behavior, and interactions. Do not
> redesign or replace the dashboard. Reuse its sidebar and header, and make
> the existing sidebar navigation open the corresponding page content.
>
> Create coherent screens for the navigation items:
> Dashboard, Website Content, CMS, Apparels, CRM, Ecommerce, Analytics, Pages, Task,
> Calendar, Email, Chat, File Manager, Charts, and Forms. Preserve their current
> names and order. The Dashboard item returns to the existing overview.
>
> Give each screen a clear page heading, relevant summary information, and
> realistic sample content appropriate to that section. Reuse the existing
> dashboard's card, table, chart, activity, search, and action patterns where
> they fit. Make each screen feel like part of the same product; do not add
> unrelated sections or new navigation categories.
>
> **UI only for sample dashboard pages:** use local demonstration data and
> client-side state. Do not connect those demo screens to APIs, databases, or
> external services. Do not claim that sample content is saved or sent to a
> server. Preserve the existing authenticated testimonial review workflow;
> submitted testimonials require approval before appearing publicly.
>
> Keep the interface responsive and accessible. Preserve the existing
> desktop dashboard layout, support the current mobile navigation, use
> semantic HTML and labeled controls, and provide visible keyboard focus.
> Implement the screens within the existing `admin/` files and keep shared
> styles and behavior consistent. Do not move or alter the separate
> `frontend/admin.html` RAFFA content console.
>
> Verify the dashboard and each new screen in a browser at desktop and mobile
> sizes. Check navigation, active states, searches, menus, forms, and actions;
> confirm there are no console errors or horizontal page overflow.

## Scope Notes

- The sample screens use local demonstration data and client-side UI state.
- Website Content supports page-text drafts/publication through protected API
  routes. CMS manages showcase entries, section visibility/order, private
  media, and testimonial review. Apparels edits product catalog and newsletter
  sections through the same page-text draft/publication API.
- Testimonials require submitter consent and stay pending until an owner or
  manager approves them. Only approved testimonials are returned to the public
  site. The admin queue requires a backend account and MFA.
- The existing dashboard checklist describes unimplemented behaviors in the
  demo analytics screens; it is separate from the CMS workflows.
