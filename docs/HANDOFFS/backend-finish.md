# Backend completion — ownership and manually funded publication

Final source freeze: 2026-11-27, 04:34 MSK. Recipient: main coordinator/integration. Scope: packages/db and apps/api; documentation updated. No installs, root/frontend/contracts/infra changes, commits or deployment. No working database migrations or fake production accounts/owners/payments.

Read AGENTS, Sites skill in full, master specification, architecture/accounts contracts and API/DB docs. Categories: architecture/backend/API/database/security/testing/documentation. Sites workflow retained existing local Next/Nest/PostGIS project; no specialist backend/security skill was available.

## Changes

- `packages/db/src/admin.ts`: wired existing six ownership and listing-review operations into common validated/live-permission execution; review returns actual shared listing/subscription projection. New listing applications snapshot existing pending/verified claims under the same per-place advisory lock as decisions.
- Adopted/completed pre-existing partial `packages/db/src/ownership.ts`, `packages/db/migrations/004_ownership_claims.sql`, `packages/db/src/privileges.ts` and API enabled-operation registrations in `apps/api/src/accounts.ts`. Verified active account status row locks during claim verification/publication. No contract change. Migration004/grants must accompany this slice.
- `apps/api/test/ownership.integration.test.ts`: two real isolated PostgreSQL/Redis/Nest scenarios using existing validated UUID fixture cleanup and actual runtime DB role. No working catalog mutation or quota weakening.
- `docs/ADMIN-API.md`, `docs/DATABASE-ADMIN.md`: actual implementation, safe rollout and operator-owned legal publication. Removed obsolete claims that these six operations are unavailable.

## Observed checks

- `npm run typecheck --workspace=@ryadom/db` PASS.
- `npm run typecheck --workspace=@ryadom/api` PASS.
- `npm run build --workspace=@ryadom/db` PASS; final compiled DB rebuilt after row-lock changes.
- `npm run build --workspace=@ryadom/api` PASS.
- PowerShell `$env:API_ACCOUNTS_TEST='1'; npm run test --workspace=@ryadom/api -- --run apps/api/test/ownership.integration.test.ts` final PASS: 1 file, 2 tests, zero skips, 17.98s. An earlier test-only CSRF refresh omission and invalid dummy PHC prefix were corrected; neither was an application failure.

First scenario: actual registration with exact published policy consent, actual admin password/TOTP enrollment, anonymous/admin denials, private claim evidence, duplicate and stale claim denial, insufficient evidence denial, independent verification with unchanged user/email/MFA facts, owner-self sensitive403, actual quote/agreement/receipt, no entitlement before approval, admin publication with actual active funded summary, stale repeat denial, claim revocation removes membership and funded projection.

Second scenario: staff own-claim and own-listing decision denial, foreign withdrawal404, stale withdrawal409, two concurrent claim verifications with one winner/one business branch, bounded empty-page real totals, deliberately failing audit insert rolls back claim/business/membership and audit, suspended applicant verification denial, immutable claim decision ledger, revocation clears applicable membership. Fixtures cleaned in finally. No claim that browser or production HTTPS checks ran here.

## Rollout and limitations

Integrator must first verify backup, then sequentially run:

```text
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs packages/db/src/cli.ts migrate
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs packages/db/src/cli.ts grant-admin-runtime
```

Working004 was NOT applied by this worker. Production roles/DB grants/secrets/durable media/HTTPS and actual bootstrap remain integrator/operator responsibilities. The operator must save and publish reviewed actual legal `terms` and `privacy` CMS documents with real versions before registration can work; test policy documents exist only in discarded fixtures. This is not authority to fabricate legal terms or consent. Claims verify business evidence only. Account email/MFA/roles are unchanged; unverified active actual applicants can be published by independently authorized staff, while owner-self privileged writes remain blocked until real identity/MFA.

Optional proposal/branch-change, cancellation/refund/export/deletion/favorites routes remain explicit unavailable. Production readiness and whole-product completion are not claimed. Coordinator owns full quality run and browser activation workflow.

## Final SHA256

- db/src/admin.ts `0025D8E1AE54FB500290E93BECDF639083FC84EFAD057F90F0B52B35A5CE1994`
- db/src/ownership.ts `5EEB412A58C8E02EDDD43996CD9777D391CF9CDC97CA79C2B4A6BC485379A9A0`
- db/migrations/004_ownership_claims.sql `02BBA4D7B730B36C5601813AC7C5300F7B37FA5A3CD3DD5F9ECE75C829905829`
- db/src/privileges.ts `B5D50B83BA033E5D36E200F956EEBE25C1F8B2645FF1F67C03009E50753647E0`
- api/src/accounts.ts `084ACBE07D1876654648156017C547A3D0FF6B7AA091936C7358D0F0FDB7B8D8`
