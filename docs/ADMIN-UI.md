# Admin UI — 10

Local Next.js implementation; Sites skill read and followed. No publish, dependencies installed, server restart or production acceptance by10. Reference mockup and design tokens retained. Flow references: [shadcn dashboard](https://ui.shadcn.com/blocks/dashboard), [react-admin CRUD](https://marmelab.com/react-admin/CRUD.html); neither library was added.

## Routes and isolation

- `/admin` and `/admin/{overview,owners,businesses,subscriptions,content,media,reviews,audit}`: SSR cookie session validated against fixed server API_URL; requires active administrative role and verified MFA. APIs independently enforce roles and permissions. No password-only or recovery assurance access.
- `/auth/admin`: actual password → MFA challenge/enrollment → one-time recovery codes. No default credentials, public bootstrap, localStorage session or fake sign-in. Operator bootstrap belongs to04.1.
- `/admin/demo` and corresponding sections: public, persistent notice **Демонстрационные данные. Не реальные клиенты и оплаты.** Synthetic owners35, nonroutable phones,22–30 demonstration days; no call links or real organization ownership. Local memory edits/reset only. Production API/auth/payment calls disabled in demo.
- Actual showcase35 snapshot copied from `data/cities/showcase35.json` with source IDs, ODbL attribution and source timestamps; no ratings/real photos/paid-client claim added. Generated category images from02.1 are labelled, optimized via Next Image and fall back to supplied category icons. Static snapshot does not claim live operating status.

## Real data workflows

Typed ACCOUNT_OPERATIONS schemas validate inputs and responses. Same-origin credentialed no-store fetch. Each mutation obtains fresh CSRF via POST `/api/v1/auth/csrf` JSON `{}` (98-operation contract). Browser supplies Origin; no injected Origin or bridge. No auto-retry writes.409 asks reload; ambiguous transport errors ask refresh before retry. Only unsafe request to the exact CSRF bootstrap operation is exempt from prior token. No client entitlement flags.

Owners: bounded20-item pages, explicitly current-page search, create/edit/archive, phone replace/delete, separately audited reason+MFA phone reveal. Reveals clear every30seconds, visibility/pagehide and route change. Funded summary uses server period/evaluatedAt and agreed IANA timezone; absent summary says unconfirmed, ended summary0days. Demo fixtures never supply real days.

Businesses: bounded list/category filter/current-page search; create/edit draft fields name/cityID/full address/street/house/WGS84/category/hours/contacts/description/provenance; separate publish/archive/CAS/reason. Unknown hours stay null. Coordinates are checked operator input; geocoder/map picker and city dropdown not yet implemented. Region follows actual city. Existing photos retained; attaching uploaded photo references to business form remains a gap. No arbitrary SQL/file console.

CMS: homepage/about section blocks (heading/paragraph/link/image), FAQ entries, contacts, legal paragraphs, trusted supplied logo/mark/hero or validated media UUID. Draft/preview/publish/history/rollback with CAS and required change note. Preview renders text, no raw HTML/inline untrusted SVG. Public consumer03.1: same typed `section.title/blocks`, faq.items, contacts.links, brand.logo/logoMark/hero; publish only, no draft fallback. Pricing/settings separate permission family currently has no UI form.

Media: actual2MiB ticket+raw raster upload, local SHA256, rights/license/attribution, server decoding/reencode/state validation. Uploaded SVG excluded. Library/archive, IDs usable in CMS assets; public media rewrite handled03.1.

Reviews: queue, preserved original/author, editorial history/reason/editor attribution/audit, separate correction and approve/reject actions. No fake review creation. Non-review proposals read-only here. Audit bounded pages, Moscow timestamps, no raw sensitive payload editor.

Manual monthly receipt form requires actual listing/quote/version/agreement reference/receipt/received timestamp/amount/month period and stable idempotency UUID. Founder contact clicks never activate anything. No listing collection endpoint; operators currently need authoritative IDs. New founder acceptance/quote form not implemented in UI; actual recorded agreement is required by API before receipt can succeed. No autocharge/checkout/provider prerequisite for manual model.

## Validation and remaining gates

10 ran `node node_modules/vitest/vitest.mjs run apps/web/src/lib/admin/admin.test.ts`:8tests PASS, isolation/count35/no-entitlement/provenance/masking/timezone/unknownperiod/transport/privateheaders/pathrejection/conflict-no-retry. Whole web tsc initially found own typing defects; fixed. Last tsc failed only concurrent03.1 `src/lib/public-cms/content.test.ts` Vitest each typing; no admin errors. Root17 owns final build/restart, QA14.1 owns six-width axe/keyboard/dialog/browser coverage and actual browser CSRF/auth. These have not yet been claimed PASS by10.

No production readiness claim: end-to-end real operator CRUD/media/public publish and manual agreement/funds tests remain integration gates. Security13.1 and DB/API owners have independent work. A successful build alone does not close them.

Latest98-op follow-up: CMS homepage first-screen heading/subheading/CTA labels editable and previewed; destinations fixed by contract. Whole-web tsc now PASS exit0 after concurrent public-CMS test fix. Admin unit8/8 PASS again. Source frozen for17 combined build and14.1 actual browser QA.

##100-operation form update (supersedes earlier gaps)

BusinessForm now includes actual region/city dropdowns, address geocoder result selection/cancellation/explicit unavailable/manual WGS84 fallback, preserved street/house and read-only existing provenance. Ready licensed business-photo picker attaches uploaded references+required alt to actual create/update requests, capped20, no generated category photos. Operators upload new rights-confirmed files through MediaLibrary first.

Subscriptions now uses actual admin listing collection/detail query (page/q business-name/status) and typed quote/external acceptance/monthly receipt actions using server IDs and versions. RawUUID-only receipt form removed. Client agreement is only recorded after actual external acceptance with selected real CRM owner, channel/time/reference/terms/timezone; saving quote or opening founder links cannot activate. Receipt amount/reference comes from current accepted quote/agreement; actual received period entered explicitly, server validates calendar/idempotency/funds/ownership.

11unit tests/2files and whole-web typecheck PASS. Previous98 snapshot actual browser evidence (17 runner): catalog CRUD/MFA/SSR/logout PASS, CMS published/draft separation PASS, public10 PASS, demo16 PASS plus fixed dialog target1 PASS. New100 forms still require17 combined build and14.1 disposable actual roundtrip/keyboard/responsive QA before acceptance. No production readiness or unrun browser PASS implied.

100runtime update from17: catalog10 PASS12.10s (actual city/region, geocoder503/manual fallback, full CRUD/public readback); media11 PASS11.84s (actual PNG→WebP, private404/public published refs, business attach/alt/publish, SVG/oversize rejected, SW/cache privacy); finance12 PASS11.67s (actual UI lookup→quote→external agreement→receipt/monthly period, idempotent replay/409 mutation, no preapproval paid entitlement, logout). Disposable operator fixtures only. Successful geocoder provider selection,11 ownership/content activation, review integration and new-form six-width checks remain separate gates.
