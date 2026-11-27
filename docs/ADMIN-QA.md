# Admin QA14.1

2026-11-27, Europe/Moscow. **PARTIAL: actual98-operation browser checkpoint verified;100-operation expansion and funded/media/review/privacy gates remain active.** This is not whole admin/product release approval. All authenticated mutations used disposable isolated fixtures; no working users/payments/catalog were changed by QA.

## Current verified checkpoint (supersedes preparation notes below)

| Run | Actual result | Evidence and limit |
|---|---|---|
| public09 |10/10 Playwright PASS +outerfixture1PASS | AnonymousSSR/noPII/API401/no-store/variants, realPOSTcsrf→wronglogin401 without Origin spoof, six-width login axe/keyboard |
| demo02 +dialog03 |16PASS/1FAIL then targeted1PASS | Twelve owners/businesses responsive axe/overflow cases,35fictionalowners/phones22–30/local-only edits,35realshowcase identities/provenance. Dialog rerun verifies Tab/ShiftTab/Escape/returnfocus/notice/axe after10fix. Not a fabricated full27-green run |
| catalog07 |1PASS14.43s | GenuineUIpassword/MFA/SSR, licensedOSMbusiness create/edit/publish/publicnear+detail/archive/logout200/durable revocation. Ingress75/private56/0denials; no waits/quotachanges |
| CMS06 |1PASS9.72s | PublishedA/newdraftB privacy, publishB→actualhomepageSSRrefresh, logout. Ingress97/private80/0denials |
| CRM02/04 subgates |PARTIALPASS | Create→DB→reload/null-funded label, masked phone→reasonedreveal→audit→navigationhide. Those complete runs remainFAIL later; no globalgreen |

catalog05 retains overallFAIL: ingress127/private102 hit actual account ingress120/60000ms; catalogCRUD completed but logout not accepted. Newbuild07 reduced counts with same quotas. public08 retains9PASS/1stalealertlocatorFAIL; scoped main.admin-error fixed09. demo01 retains10PASS/7hiddenstreamingmain locatorFAIL; visible-main helper fixed02. Earlier SSR/category/form diagnostic failures retained in artifacts/history. No skipped-green assertions.

Sites1.2.0-relay full and portable preview read in addition to earlier1.1.7. Typecheck PASS after latest QA-only fixes, discovery27Playwright/2projects and1Vitestscenario PASS (discovery is not execution).17 owns all build/start/stop/fixturelaunch/restoration; QA owns new test/support files only. Stable accounts disabled; actual401/auth proofs used enabled fixture.

Final98 snapshot captured after public09/dialog03: BUILD_ID SHA2563D3EA1504AB4E56AA7A507BF6412065A2A98FE20AB800C91B11D660A293C9790; routesmanifest1BE87DC960FE759ACB716595757FD1E54908711FAEB94F46451A32AFC6B73B2A; panel33BBF7038F0B3CB6CFE17219EAABA2955F32BD7C2BF71A14E9E4E276025018BC; dialog2EB8C36AF0E43853A7FFCBA1C8B5B1953C2A943D4699E8ADEF88BCBBF616BC84. Later100-operation source edits are not covered automatically.

Actual demo02 owners360/businesses1440 screenshots extracted from JSON and visually inspected: readable mobile/desktop flow, persistent demo/illustration labels, source/licence disclosure, unknown facts retained, no false paid-owner links or excessive gradients/glass/glow. Automated twelve viewport cases cover360/390/768/1024/1440/1920. This bounded visual review is not exhaustive UI acceptance.

Remaining active work:100 city/region/geocode/photoattachment/listinglookup affected tests; actual manualfunding/remainingdays, mediaUIapprovedphoto/public pointers, revieworiginal/history/independentmoderation, authenticatedSW/cache/storage and form accessibility. Existing backend unit/integration evidence does not substitute browser checks. Preserve no real payments/credentials/outboundmessages.

Skill: Sites read in full, including portable local preview. Categories: testing, UI/accessibility/responsive, security/privacy, API/database/GIS integration, documentation. No specialist QA/security/design-review skill is available. Existing Playwright1.65.1 and axe4.14.1 are reused; no dependencies installed. Only new admin-prefixed test/support files and this report/handoff belong to14.1. Existing stage1 suite is unchanged.

## Invocation

Owner17 supplies a frozen source snapshot and current loopback BASE_URL/API_URL. Tests never start servers or build Next. From repository root, set BASE_URL/API_URL and a unique QA_RUN_ID, then:

```text
node node_modules/typescript/bin/tsc --noEmit -p packages/qa/tsconfig.json
node node_modules/@playwright/test/cli.js test --config packages/qa/support/admin.config.ts --list
node node_modules/@playwright/test/cli.js test --config packages/qa/support/admin.config.ts --project admin-public
node node_modules/@playwright/test/cli.js test --config packages/qa/support/admin.config.ts --project admin-demo
```

The dedicated config is outside existing stage1 projects. Missing URLs fail with BLOCKED, not skipped-green. API handlers must return actual401/UNAUTHORIZED;404/503 are not passing authorization. Artifact output is ignored under packages/qa/artifacts/<QA_RUN_ID>; keep failed results and use a new run ID for reruns. Never store credentials, TOTP seeds or private phone/receipt text in artifacts. Public/demo screenshots and axe traces contain no real private fixture data.

## Acceptance matrix

| Gate | Required evidence | Current state |
|---|---|---|
| Anonymous protection | Real SSR gate on all data routes, no private entities in initial HTML; actual API401/no-store | Prepared; NOT RUN |
| Login | Labels, password semantics, keyboard and axe at360/390/768/1024/1440/1920 | Prepared; NOT RUN |
| Demo isolation | Every view/dialog banner;35 fictional owners, nonroutable examples,22–30 synthetic days; no phone dial links; edits make zero private API requests or public metrics changes | All8 views/dialog, paginated35 count/edit/reset/reveal/timeout prepared; NOT RUN |
| Business CRUD | Disposable real licensed-source fixture; city/street/category/hours/contact draft readback after reload; explicit publish; public nearby/details change; archive and audit | BLOCKED isolated DB/API/staff MFA fixture |
| Owner CRM | Create/readback; list/detail masked; reveal requires role, fresh MFA and reason; audit precedes reveal; clear on row close/navigation/timeout | BLOCKED isolated fixture; unit/transaction failure gates04.1/05.1 |
| Manual monthly funding | Actual fixture receipt/agreement/period and operator confirmation; same-key replay stable; changed-key payload409; no activation by contact/message; no automatic debit | BLOCKED isolated ledger fixture; never record real receipts/payments |
| Server permissions | Password-only/recovery/role/BOLA denial, Origin/CSRF variants, expired MFA, session rotation/revocation | Primary04.1 backend runtime tests; browser role fixture pending |
| CMS | Save draft durable; publish pointer; actual public content projection/home integration when implemented; no false success toast | BLOCKED isolated CMS fixture and public consumer |
| Media | Real PNG/WebP decode/reencode; malformed SVG/MIME/oversize2MiB rejected; no traversal/unpublished bytes; category illustrations labelled | BLOCKED media adapter and isolated fixture; decoder/DB failure tests04.1/05.1 |
| Reviews | Immutable original author/text/rating; append-only correction reason/audit; pending after correction and truthful editorial indication when republished | BLOCKED real isolated submission/moderation fixture |
| Privacy/SW | No API/private/PII responses in cache/storage; reveal absent after navigation/logout; no token browser persistence | BLOCKED authenticated fixture; no stage1 cache rerun substituted |

Public showcase35 records are licensed source organizations, not proof of paying customers or fictional owner associations. No Yandex/2GIS images are imported. No founder VK/TG messages or calls are sent. Demo fixtures cannot close real persistence/auth/funding gates. Design review will inspect actual responsive screenshots for legibility, useful table flow and product-specific branding; axe alone is insufficient.

## Results

- `admin-cms-06` fresh CMS-only fixture, invoked by17: **1 PASS**. Genuineproxy/password/MFA/SSR, publishedA/newdraftB privacy, publishB→actual SSR homepage refresh, logout200/durable revocation/private storage checks passed. Counts: account ingress97/private-read80/auth10/write4, publicread10; rateDenials=[] and failures=[]. No credentials/PII artifacts. This proves the tested CMS/homepage slice only.
- `admin-catalog-05` fresh catalog-only fixture: overall1 FAIL at final logout gate; completed licensed business UI create/edit/publish/public-near+detail readback/archive. Exact delegating limiter evidence: account ingress127 with max120/window60000ms; private-read102/auth10/write5, publiclegacyread3. Seven ingress rejections. CRUD sub-gates PASS; logout not accepted from this run. UI/public-CMS fanout fixes routed10/03.1; fresh new-build rerun required. Temporary conditional62s pre-logout pacing was never a fanout fix and is removed for the new-build comparison. No quota reset/relaxation or blanket retries.
- `admin-demo-01` real stable combined build:10 PASS/7 FAIL.35 fictional-owner pagination, phone examples/days/local edit and35 actual showcase identities/provenance passed. Seven failures share streaming readiness locator: hidden loading main plus visible admin main. Fixed own helper to wait exactlyone visible main; no axe rules suppressed. JSON evidence initially located support/packages/qa/artifacts/admin-demo-01/results.json due relative reporter config; future JSON path made absolute. Screenshots/axe remain standard artifacts directory. Responsive/axe full gate pending02 rerun.

- `admin-isolated-01` executed by17 on the combined production build:1 FAIL at SSR-origin proof before CRM writes. Unique temporary API proxy401 and genuine browserPOSTcsrf/password-only denial passed; MFA overview appeared. QA predicate wrongly rejected Undici's `Sec-Fetch-Mode:cors` as browser-only. Fixed only own predicate: requires cookie with absent Origin/Referer/Sec-Fetch-Site/Sec-Fetch-Dest; records safe boolean header-presence diagnostics. No Origin spoof/session injection/proof skip. Typecheck PASS; targeted02 requested from17, pending. Original checkpoint retained under packages/qa/artifacts/admin-isolated-01/runtime-checkpoint.json. This is a QA harness failure, not evidence of an application auth defect.
- `admin-isolated-02`:1 FAIL selecting categories with exact wrapping-label locator, before business creation. Completed: unique real proxy, real POSTcsrf/password-only denial, MFA enrollment/SSR fixture proof, CRM create→DB→reload/null-funded label, masked phone/reason/reveal/audit/navigation clear. Safe header-presence evidence differentiates NodeSSR (no Referer/Site/Dest, mode:cors) from actual browserGET (Referer/Site/Dest present). Source confirms a native multiple select whose wrapping label includes option text; fixed QA to dialog.getByRole('listbox').selectOption(['cafe']). Typecheck PASS,03 rerun requested. Original02checkpoint retained; no auth/response mocking or application edit.
- `admin-isolated-03`:1 FAIL, first business save leaves dialog open; prior SSR/MFA/CRM/phone gates repeat PASS. Root cause unclassified at this snapshot. Source has numeric step:any; exact OSM-derived DTO independently parsed successfully with compiled shared AdminCatalogBusinessCreateRequestSchema (valid:true,issues:[]). Added safe diagnostic at failed save (control names + validity booleans, generic alert, sanitized API status/error codes), no values/private bodies.04 targeted observation requested from17; no application defect claimed yet.

- `node node_modules/typescript/bin/tsc --noEmit -p packages/qa/tsconfig.json`: PASS after all27 prepared Playwright tests and isolated runner.
- `node node_modules/@playwright/test/cli.js test --config packages/qa/support/admin.config.ts --list`: PASS,27 tests in2 files/2 projects; discovery only, zero E2E executions.
- `node node_modules/vitest/vitest.mjs list --config packages/qa/support/admin.runtime.config.ts`: PASS,1 isolated runtime scenario discovered. Vite prints future native-config CommonJS/ESM compatibility warning; current discovery works. No manifest/dependencies changed to suppress it.
- No live admin build has been released by17 at this checkpoint. No E2E test has executed and no application defect is asserted from an obsolete build.

Next recipients:10 freezes accessible demo labels/routes;04.1/05.1 provide isolated fixture and runtime controls;17 releases frozen build URLs;14.1 runs browser checks and records exact source/build hashes, command, counts, evidence and reproducible severity/path findings;00 accepts only actually verified gates.

## Isolated runtime runner (17 sole launcher)

New support/admin.runtime{.config,.test}.ts uses04.1 createAccountFixture({origin:'http://127.0.0.1:3171',port:3001}), validated separate ryadom_accounttest_UUID DB, random operator password only in memory, Redis test namespace and private media temp directory.17 stops both stable API/web for the window so the public preview cannot accidentally access the fixture. Frozen Next routes-manifest must explicitly rewrite API to127.0.0.1:3001; ports3001/3171 must be free. Runner never builds Next.17 sets ADMIN_QA_ISOLATED=1,ADMIN_QA_BUILD_READY=1 and unique QA_RUN_ID, then runs:

```text
node node_modules/vitest/vitest.mjs run --config packages/qa/support/admin.runtime.config.ts
```

Before auth or CRUD it proves Next proxy reaches fixture through a random nonsecret header on real401 response. Real browser UI then uses canonical POST/auth/csrf (no injected Origin/header, cookies or routes), actual password challenge/MFA enrollment, and SSR fixture auth/me call with cookie before CRM mutations. It checks CRM create→DB→reload; phone mask/reason/audit/reveal/navigation hide; actual publishedA/draftB public CMS separation and homepage SSR update after publishB; logout/no browser token persistence. HTTP loopback uses explicit API development-cookie policy; it does not verify production Secure cookies/TLS. Screenshots/traces/storageState are disabled for this runner to keep secrets/recovery codes/private values out of artifacts. Nested finally attempts browser close, own Next child stop and fixture cleanup even after failure;17 restores stable services. A safe checkpoint contains completed gate names only. Runtime has NOT RUN at this checkpoint. All broader CRUD/funding/media/reviews/roles and six-width authenticated forms remain separate pending gates.


