# @ryadom/qa

Automated phase-1 acceptance. Source-only QA workspace; integration owner17 installs pinned dependencies and starts Next/Nest. No root `test` script is added here. Original product assets and app code are read-only for QA14.

Run from repository root in PowerShell with actual service origins:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3000'
$env:API_URL = 'http://127.0.0.1:3001'
$env:QA_RUN_ID = 'live-api-01'
npm run typecheck --workspace=@ryadom/qa
npm run test:e2e:list --workspace=@ryadom/qa
npm run test:e2e --workspace=@ryadom/qa -- --project=live-api
```

Change `QA_RUN_ID` between runs to preserve evidence, then select `live-ui`, `mocked-ui` or `pwa`. A passing `--list` is discovery only. No automatic retries or skips; missing URLs fail preflight explicitly. Processes are owned by17; QA does not start/stop them. `QA_BROWSER_CHANNEL=msedge` or `chrome` uses fresh automated profiles when needed. Default installed Playwright Chromium uses its own context, never a user's profile.

- `live-api`: genuine provider geocoding, catalog/distance/provenance/detail, route geometry, bounded HTTP validation/header smoke. Coordinates in live search/route come from the geocoder result. The reference address coordinates are an assertion, never a provider replacement. Provider absence fails acceptance.
- `live-ui`: six required viewport widths, full screenshots, overflow, axe WCAG, menu keyboard/focus, navigation parameters, consent denial, reduced motion, genuine address→catalog→map→route, laboratory performance evidence.
- `mocked-ui`: isolated browser interception for empty vs unavailable/retry/geocoder/router, literal untrusted catalog text. Report tests use genuine SSR detail plus intercepted write errors/invalid receipt; they do not write data. Fixtures contain conspicuous QA ONLY labels and are never imported into public catalog. Service workers blocked here.
- `pwa`: actual production registration/offline/recovery and cache inspection after API/query/private probes. Development mode intentionally fails registration checks. No VM/unit result is substituted for browser evidence. Controlled update/multi-tab/native OS install require a separate production revision/session and remain unverified until recorded.

Artifacts are ignored under `artifacts/<QA_RUN_ID>/`: JSON, HTML, trace, screenshots, API responses. They can contain requested public address/route and local origins; do not publish them as anonymized analytics. Tests use no personal geolocation. Local report mutations, if later introduced, must be explicitly named and kept separate from intercepted failure tests.

Read `docs/QA-REPORT.md` and `docs/HANDOFFS/14.md` for actual observed results, blockers and routing. Security negative suite04/13, real DB durability, container audit and CUA visual review remain owned by their designated tasks; this suite supplies selected smoke/browser evidence only.
