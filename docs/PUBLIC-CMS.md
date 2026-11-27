# Public CMS consumer — 03.1

Local Next/Nest implementation, 2026-11-27. Uses authoritative `@ryadom/accounts-types` CMS/media schemas, including optional `HomepageHero`. No private admin/CRM requests or cookies are used by public content reads.

## Published slots

| CMS key | Visible destination |
|---|---|
| homepage | `section.homepageHero` heading, subheading, primary/secondary CTA labels; targets remain `#quick-search` and `/map`. Existing section title + first paragraph are the legacy hero fallback. Remaining section blocks render after hero. |
| about | Homepage About area and `/about`, semantic headings/paragraphs/links/images. |
| faq | Homepage native details/summary and `/faq`. |
| contacts | Footer contact links and `/contacts`; missing content preserves original founder/studio links. Business billing contacts remain the specifically approved contract links. |
| brand | Header/footer horizontal logo, homepage mark and hero illustration. Existing supplied assets remain immutable fallbacks. |
| terms/privacy | Public document title, version and paragraphs on matching pages. |
| site-settings | Root metadata title/template and description; indexing=false can restrict robots, true does not override deployment SEO restrictions. Homepage generateMetadata applies the same published settings, including OpenGraph text, while retaining canonical and deployment robots policy. |

Reviews continue through `/platform-reviews` using the original validated public DTO. Original author/text/rating and server-provided editorial/source disclosure render as text. This consumer does not manufacture testimonials or moderate reviews. Business CRUD public projection remains the existing place API responsibility. Category labels, navigation, how-it-works, advantages, install/help, business banner and final CTA are original code copy, not all editable CMS slots.

## Publication, transport and fallback

Only `GET /api/v1/content/{explicit-key}` is fetched. Complete public envelope is strictly parsed; mismatched key/kind, unexpected fields, markup, unsafe links and malformed assets fail closed. Published revision IDs are attached as `data-cms-revision` for integration checks. No draft or revision-list endpoint fallback exists. Server React request cache deduplicates a key during one render, not across requests; `fetch cache:no-store` makes the next full document load read current publication. Existing client router/layout reuse can require a full reload to see a newly published brand/contact. CMS requests time out after 2500ms and honor caller cancellation. Missing404 and unavailable/error states stay distinct in the adapter; public essentials use original copy for either condition without exposing infrastructure error payloads.

`/media/:path*` rewrites only to the configured fixed API origin's `/media/:path*`. Public component URLs accept only four supplied asset paths or `/media/{UUID}.webp` matching `mediaId`. API must serve only currently published references and enforce approved ready media, WebP MIME, nosniff and no-store. Browser load failure restores original brand/hero; unavailable content images disappear. Original asset files are unchanged. Images have dimensions, alt, bounded width and caption support; illustrations require truthful captions/alt and cannot be represented as actual business photographs. Existing global image CSP also supports the previous licensed business photo flow; this consumer itself introduces no remote media destination or SVG upload rendering.

`PublicChrome` hides header/footer for `/admin`, `/auth` and descendants, plus `/login`. It keeps route children rendered and does not implement authorization; server admin guards remain authoritative. No route files are moved and no admin subtree is edited. Public skip-link remains in Header.

## Checks and outstanding acceptance

`npm run test --workspace=@ryadom/web`: PASS, 10 files / 125 tests at 03:35 MSK (includes 19 CMS boundary/render/metadata cases). `npm run typecheck --workspace=@ryadom/web`: PASS. Includes publication schema/404/outage, key mismatch, draft/HTML/unsafe URL/unknown-field rejection, media UUID matching, timeout/cancellation, typed hero slots, React escaping, captions, native FAQ and legal version rendering. Render subjects compile with installed TypeScript React JSX mode because Next's tsconfig deliberately preserves JSX; no shared test config changed.

Live API snapshot: `/content/homepage`404, `/content/brand`404, `/platform-reviews`200 empty. This proves fallback readiness only. Real published A → newer private draft B → publish B → next-load visibility, uploaded media, same-origin rewrite, all six widths, keyboard/focus/contrast/reduced-motion and logo/hero layout must be verified against the combined build and disposable real API/DB fixture from17/14.1. No Next build, install, deploy, real content mutation or production data fixture was run by03.1.

Source freeze 03:36 MSK: metadata ownership explicitly assigned by00 and fixed in app/page.tsx;17 reports declared accounts-types dependency and serial install complete. Ready for combined build; runtime/browser acceptance remains pending.
