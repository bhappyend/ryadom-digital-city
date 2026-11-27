# Интеграция этапа 1

Владелец17; 2026-11-27. Статус: **в работе, приёмка этапа 1 не завершена**. Категории: архитектура, backend/API/database/GIS, security, testing, performance, документация; preview поддерживает UI/UX/responsive/accessibility QA у03/14. Прочитан Sites SKILL полностью, local-only/custom Next/Nest/PostGIS stack и portable preview reference. Специализированные GIS/security/UI Skills отсутствуют. Нет commits/push/deploy; оригиналы `ryadom-digital-city/` сохранены.

## Dependency ownership и сборка

Только17 запускает npm install/ci и меняет root lock. Root workspaces `packages/*`, `apps/*`; точные версии сохраняются. Первичная передача01→17 пересеклась с уже запущенным install01: обнаружены TAR_ENTRY_ERROR/ENOTEMPTY; оба процесса завершены, без удаления чужих файлов. Повторная проверка Win32_Process не обнаружила npm install/ci. Единственный recovery `npm install` завершился exit0: added5, changed277, audited262, vulnerabilities0. Это результат на тот момент, не бессрочный security сертификат.

Lock зарегистрировал api, web, config, db, gis, importer, qa, types, ui. `npm ls --workspaces --depth=0` exit0; после восстановления отмечены extraneous optional sharp/emnapi packages. Финальный npm ci отложен до freeze manifests: координатор сообщил о новом независимом workspace01.1 accounts-types. Ни install, ни npm ci параллельно не запускаются.

`build:shared`: types → gis → db. `build`: shared → API → web; UI TS компилирует Next. Production API импортирует `@ryadom/db/compiled`, обычный Node не исполняет source TS. Root typecheck/test перечисляют workspaces явно; отсутствующий script не скрывается `--if-present`. QA browser и реальные DB/import integration checks отдельные, unit pass их не заменяет.

## Runtime

`scripts/runtime.mjs` читает необязательный root `.env`; API берёт только APP_DATABASE_URL/REDIS_URL из игнорируемого `infra/.env.local`. Admin DATABASE_URL/POSTGRES_PASSWORD не копируются. Web не читает infra файл. Process env имеет приоритет над root .env и infra defaults. Изоляция и приоритет подтверждены2 unit tests. Полные env/credentials не выводились.

API production preview: `npm run start:api`, retained session81338, `http://127.0.0.1:3001` (owner17). Web dev preview: `npm run dev:web`, retained session73560, `http://127.0.0.1:3000` (owner17). Это живые процессы на момент записи, не hosted deployment. Перед остановкой/заменой сообщать QA14/координатору00; завершать только свои PID/session, не broad kill. Итоговые sessions/teardown обновляются в handoff17.

API_URL default `http://localhost:3001`, browser same-origin `/api/v1`, CORS exact localhost/127.0.0.1:3000. GIS_ALLOWED_ORIGINS и MAP_ALLOWED_ORIGINS — отдельные provider allowlists. Нет автоматического public GIS fallback.

## Наблюдаемые проверки

Все команды с workdir `C:/Users/tihoyo/Documents/ChatGPT/Рядом - PV`, Node22.22.2/npm10.9.7. Результаты обновляются после исправлений владельцев.

| Команда/сценарий | Наблюдение |
|---|---|
| `npm install` первый17 | exit1 ENOTEMPTY rxjs при overlap с01; не PASS |
| `npm install` recovery17 | exit0, added5 changed277 audited262, vulnerabilities0 |
| `npm run build:shared` | exit0 types/gis/db |
| `node packages/types/scripts/openapi.mjs --check` | exit0, parity10 operations |
| `node --test scripts/runtime.test.mjs` | exit0,2/2 |
| Workspace types/GIS/DB unit | exit0:34/62/2 |
| UI `node scripts/check-components.mjs` через npm test | exit0, SSR contracts8 component families |
| Importer unit initial | exit1, test file ещё не создан; требуется повтор после готовности07 |
| Web unit initial | exit0 с No test files found; **не покрытие UI** |
| Root `npm run typecheck` initial | exit1 API config TS2375, web baseUrl TS5101; остальные workspaces пройдены в этом запуске |
| API build initial → после04 | TS2375 → exit0 |
| API HTTP initial → после04 | OXC tsconfig resolution error до collection →49/49 PASS; причина initial OXC не установлена, повтор01 с отключённым cache также PASS |
| API production `/health/live`, `/health/ready` | HTTP200, DB/rateLimiter available; GIS not configured |
| API `/categories`, `/cities` | HTTP200,14 категорий,1 проверенный город Смоленск |
| API `/map/config` | HTTP200, explicit unavailable/not_configured |
| API cache | no-store на перечисленных ответах |
| Web `/` initial | HTTP500, отсутствует globals.css;03 завершает shell |

## Дефекты и границы приёмки

-04 исправил test cwd и config exactOptionalPropertyTypes;05 добавил compiled subpath;06 исправил test cwd. Подтверждены targeted rechecks.
- API canonical env согласован после обнаружения prefix alias mismatch; CORS/GIS variables не смешивать. GIS_TIMEOUT_MS пока advertised, code использовал5s literal — передано04.
-13 обнаружил reports trailing-slash/case Origin/rate-bucket bypass;04 добавляет handler-bound guard и regression cases. Итог security retest принадлежит13/04.
-03: globals.css и TS6 baseUrl blocker переданы; не менять apps из интегратора.
- DB/PostGIS fixtures и backup/restore принадлежат05/15; их handoff evidence отдельно от реального импортированного каталога07.
- Реальный адрес → кафе → реальный маршрут пока **не принят**. GIS06.1 provisioning, импорт07, browser QA14, PWA production checks и responsive360/390/768/1024/1440/1920 должны дать собственные результаты. Fixtures/mocked UI не называются live acceptance.
- Hosting, лицензии, source freshness, security/performance/legal gates см. профильные документы. Build/health не означают production readiness.

## Контрольная точка после clean install, 02:38 MSK

- Новый frozen manifest accounts-types зарегистрирован отдельным `npm install`: exit0 added1/audited264/vulnerabilities0. Source этапа2 не включён в stage1 checks.
- Превью17 остановлены Ctrl+C; проверены отсутствие owned runtime/Next/main процессов и listeners3000/3001. Единственный `npm ci` exit0: added253/audited264/0 vulnerabilities,1min. Никаких ручных recursive deletions.
- `npm test` exit0: runtime2, PWA64, types34, GIS62, DB2, importer10, UI SSR8 families, API55 passed/1 skipped optional integration, web94 tests/5 files. Skipped integration не считается пройденной.
- `npm run typecheck` exit0 для всех явно перечисленных stage1 workspaces; `npm run contracts:check` exit0/parity10.
- Новые owner17 sessions: API production55211, web dev98529. `/`, `/map`, web rewrite `/api/v1/categories` HTTP200. API ready200: DB/Redis/map available, router configured, geocoder not_configured.
- API process env настроен на локальные map8089 и Valhalla8002, exact provider allowlists+explicit localHTTP. Secret values не выводились/не записывались в tracked env.
- Реальный route smoke через production API из verified City.center к фактическому OSM cafe (direct323m, catalog191cafes): walking200/15points/457m/327.046s/8maneuvers; driving200/17points/527m/41.383s/3maneuvers; cycling200/14points/397m/144.074s/7maneuvers. Все RouteResponseSchema validation PASS. Это partial GIS integration, не acceptance адреса.
- Frontend03 завершает08/16 integration, local MapLibre worker и contrast fix после CUA00. Next build не запускался, single slot зарезервирован17 после sourcefreeze03. Перед build webdev будет остановлен, далее production preview для QA14/PWA.
- Import07 обнаружил20 неверно классифицированных chemist POIs; исправление same-snapshot taxonomy требует05 CAS renormalize. Не скрывать этот reconciliation blocker. Fixture DB/backup evidence см.05/15, не смешивать с живым acceptance.

## Production preview, 02:41 MSK

`WEB_MAP_CONNECT_ORIGINS=http://127.0.0.1:8089 npm run build` (PowerShell env assignment) exit0: types→gis→db→API→Next; Next compiled5.7s/TypeScript6.4s,8routes listed. Dev98529 stopped before common.next build. `NODE_ENV=production`, WEB_MAP_CONNECT_ORIGINS8089, `npm run start:web`: retained92926, Ready368ms. API55211 remains. HTTP /200,/map200 (HTML private/no-store), /sw.js200 application/javascript public max-age0, manifest200, same-origin categories200 no-store. QA14 notified production ready for worker/PWA/responsive. This supersedes earlier dev session statuses; no production hosting deployment.

New city-catalog manifest07.1 frozen, controlled install queued after QA safe window; previous npmci snapshot predates this workspace. Stage1 build excludes new source until handoff. Pending full geocoder acceptance, browser results, taxonomy reconciliation and final preview teardown from00.

Geocoder checkpoint02:43: Nominatim8088/status200 и upstream boundedsearch «Смоленск улица Ленина8»200/2items (реальный дом и музей). API55211 остановленCtrlC и перезапущен90596 с canonical NOMINATIM_URL8088, GEOCODER_PROVIDER=nominatim, GIS_ALLOWED_ORIGINS8088+8002. API /geocode200/2items, QA14 notified full liveAPI ready; webproduction92926 unchanged. Это ещё не полный browser acceptance.06.1 thread failed usage limit, readiness проверена17 read-only без infra edits. QA stats dl семантический дефект routed03; scopedfix00authorized, потребуется rebuild послеQAwindow.

Live API address slice17: Nominatim «Смоленск улица Ленина8» → nearest cafes radius1500 (109 matches) → OSM destination >50m → Valhalla walking HTTP200,58m/41.462s/2points (short genuine upstream route). Geocode/Places/RouteResponseSchema validation PASS, actual sources nominatim/osm/valhalla. This short-route smoke does not replace QA14 street geometry >2points/browser acceptance; previous longer3profile smoke had14–17points. QA14 production map screenshot/check confirms actualtile and no worker/CSP errors; browser full suite remains pending.

## Accounts monthly contracts integration, 02:51 MSK

Accepted final01.1 handoff: monthly RUB listing subscription, nullable monthlyPriceRub until configured, autoBilling=false, explicit period/grace/cancellation; no payment activation or price configured. Root build:shared now types→accounts-types→gis→db (accounts before future consumers), root typecheck/test include accounts-types explicitly. Added contracts:accounts:check, separate from original v1 OpenAPI.

Exact targeted checks from repo: npm run contracts:accounts:check exit0 (types build, accounts build, parity74operations); npm run typecheck --workspace=@ryadom/accounts-types exit0; npm run test --workspace=@ryadom/accounts-types --workspace=@ryadom/types exit0 (17+34=51PASS). gitdiffcheck ownedpaths exit0, untrackedfiles limitation unchanged. No install/ci, no lock mutation for this follow-up: dependency manifest unchanged. Stage2 implementation/payment/DB/browser acceptance not implied. Existing production preview untouched.

## Metrics/business rebuild final checkpoint02:56MSK

QA14 explicitly confirmed idle before stop. Web92926 stoppedCtrlC; single controlled npm install for frozen city-catalog manifest exit0 added1/audited266/0vulnerabilities. Previous clean npmci snapshot264 predates this new workspace; no new clean-ci claim266. Root test:business added, independent node apps/web/scripts/verify-business.mjs PASS4SSRvariants exactcontacts/manualmonthly/noinventedprice/noonlinecheckout. Manual contract extension targetedbuild+parity74PASS,18accounts+34original=52PASS (supersedes51).

Single npmrunbuild with WEB_MAP_CONNECT_ORIGINS8089 exit0, order types→accounts-types→gis→db→API→Next. Nextcompile1.0s/TS4.6s. Includes03metricsdlfix and monthlymanualbusinesscopy. Startproduction newweb85390 Ready331ms, API90596 remains. These are latest active owner17 sessions; earlierweb92926 stopped. HTTP/200,/business200,/business/pricing200, exactVK/TGlinks present; monthly/manual/noauto/noonlinepayment paragraphs compared directly to source and matchPASS. Initial loose substring checks returnedfalse due differentwordstems; exactsourcephrases confirm finalcopy. QA14 notified targetedaxe6widths/PWA rerun. No checkout/payment activation or outboundmessages, no commit/push/deploy. Finalbrowseracceptance/teardown stillpending00/14.

## National catalog read smoke

Existing production API90596 reads newcities without restart: GETcities200 order Kotelniki(city-67488a01-ccb7-4638-bcad-117db0fbe9a3), Dzerzhinsky(city-6fa8b59c-cda7-4c98-8b41-e0bcb2867e16), Smolensk; categories200/14. For each newcity actual City.center query radius10000: HTTP200/5records each, sharedPlacesResponseSchemaPASS, every cityId matches and provenance sourceosm. Smolensk bounded10kmquery2327matches/50returned; this is not fullDBcount and does not contradict preserved2339source records. No allRussia/officialregistry/GIScoverage acceptance implied.

Confirmed frontend default regression: Home15 cities[0], QuickSearch11 cities[0], MapExplorer29 enabled[0] fallback now chooseKotelniki. ProductionGET/ selectedoptions show headerSmolenskpilot and QuickSearchKotelniki mismatch. Routed03 with exactpaths/scenario: explicitly prefer enabledSmolensk untiluserchooses, preserve query/user/destination city, testreorderedcities. No appsedited17. Initial optionalHTMLregex smoke failed due shellquote beforeexecuting; simplifiedselectedoptionregex repeat succeeded. APIreadsmoke itselfexit0.

## National default correction production checkpoint03:01MSK

03 shared selectCity prefers explicitenabledcity→Smolensk→firstenabled; home/QuickSearch/mapfallback use it. Independent npm exec --workspace=@ryadom/web -- vitest run src/lib/city.test.ts exit0,4/4 (reorderednational,explicit,unknown/disabled,emptyfallback). QA14 explicitlyidle confirmed before stopweb85390. Sole npm run build --workspace=@ryadom/web with WEB_MAP_CONNECT_ORIGINS8089 exit0 (compile1.1s/TS5.6s). No dependencychange/install. Newproductionweb39752 Ready355ms http://127.0.0.1:3000; API90596 remains.

GET/200 selectedoptions now [Смоленск·пилот,Смоленск,Всекатегории], actualoptionvalue smolensk selected=true whileAPIstillKotelniki-first. ConfirmsSSRdefaultfix withoutDBorderworkaround. Explicitcitypreservation verifiedunit; QA14requested browserbare/map+explicitKotelnikiquery checks. Source/mapcity-state browseracceptance notclaimedbySSR. Latestactiveowner17sessions web39752/API90596 supersedepriorIDs. Coordinator00/03/14 notified; fullrelease/teardown pending.

## City-catalog scripts refinement acceptance

07.1 changed scripts only: offline test now explicitly selection.test.ts, PostGIS test:integration separate. Dependencies unchanged, no install/ci/lock mutation. Independent npm run typecheck --workspace=@ryadom/city-catalog exit0; npm run test --workspace=@ryadom/city-catalog exit0/6PASS. Root explicit typecheck/unit test chains now include city-catalog, integration not auto-run or claimedpassed. LiveGETcities200 sharedCitiesResponseSchemaPASS/count25/Smolensk enabled, measured snapshot during ongoingbatch; no official/allRussia/completeness/coverage claim. Owner07.1 PostGISintegration evidence pending separately. Productionweb39752/API90596 untouched.

## Final national checkpoint received07.1

Independent npm run test --workspace=@ryadom/city-catalog exit0/7PASS (selection6+showcase1); updated script explicitly lists both unitfiles, depsunchanged so noinstall/lockmutation. Owner07.1 reports typecheckPASS, isolatedPostGIS6/6PASS and read-onlyDB85cities/2753places/Smolensk2339preserved/414selected84cities/IDsunchanged; these DBfigures are externalowner evidence, not rerun17.

Own runtimechecks: GETAPI90596/cities HTTP200, strictCitiesResponseSchemaPASS,85records <=contract2000, Smolensk enabled. GETproductionhome39752 HTTP200, selectedoptions [Смоленск·пилот,Смоленск,Всекатегории] despite85cities. HTMLhas102totaloptionnodes (includes category/header options; not citycount). QA14 requested actualbrowserexplicitnonSmolenskchoice/baremapdefault preservation. Showcase35 artifact reported35records/34cities/11regions/12categories by07.1, artifacttestsPASS; this is not frontendshowcaseintegration. Expansionstopped00; no allcities/officialdenominator/GIScoverageclaim. Earliercoverage gaps remain in ownerdocs. Sessionsunchanged39752/90596.

## Accounts runtime preparation / native dependency install

04.1 API and05.1 DB dependency manifests frozen; QA14 explicitidle confirmed. Single npm install exit0 added12/audited278/vulnerabilities0 (4s), addingargon2.45.2/sharp.35.5 andaccounts-typeslinks. Native smoke exit0: argon2id hash/verify (testconstant only,no userpassword) and sharp1x1PNG encode/decode entirelymemory. Not auth/security/media-endpoint acceptance; owner04.1 implements those.

Created rootignored .env.accounts.local via crypto.randomBytes32 base64 forMFA/ratekeys+unique keyID; existingfile preserved ifpresent, no valuesprinted. Updatedruntime API-onlywhitelist reads3keys; webneverreadsaccountfile, migrationscretsnotcopied. KeyfilecannotenableACCOUNT_ALLOW_LOOPBACK_HTTP. Processenv/root.envoverride explicit; no implicitNODE_ENVdowngrade.3runtimeunittestsPASS (isolation/override/noHTTPbypass), gitcheckignore.env.accounts.local/.local-mediaPASS, node/diffchecksPASS. Added.local-mediaignorepreservingallpreviousrules androotenv/READMEinstructions. Local filemode0600requested; WindowsACLhardeningnotclaimed. No keyrotation, noauthactivation, existingproductionAPI90596/web39752notrestarted. Owners04.1/05.1 notifiedinstallready.

## Full admin priority / showcase identity verification

Coordinator00 assignednewowners05.1DB/04.1API/10adminUI,01.1admincontractextensions,02.1isolatedadminillustrations. Root17remainssoleinstaller. ExistingAPI/DBfrozendepsalreadyinstalled278audit, no repeatinstallunchanged. Requested10packages/admin-demoexactmanifestfreeze; fulltests/build/restarts deferreduntillreadysources. Demo35owners must remainmarkedisolated, noauthDB/paid/publicseed. Stableweb39752/API90596unchanged.

Ownread-onlyshowcaseHTTPverification: data/cities/showcase35.json records35/uniqueIDs35; sequential GET /api/v1/places/{actualslug}35/35HTTP200, each sharedPlaceResponseSchemaparsed, id+cityIdmatchartifact, OSMprovenancepresent,0failures. No syntheticrecords/paidownerscreated, no payments/outboundmessages. This confirms existing35publicplaceidentities, notadminCRUD/auth/readiness orallcitiescoverage. QA14futureadminbrowserassignmentvia00onceUIavailable.

QA14.1 (01a21a59-19dc-7e10-a3bf-390d95c24df8) admin test preparation accepted: existingqa/newfiles only, no manifests/deps/install changes. Admin readiness must use owner-frozen source snapshot, separateadminbuild/readyURLs and isolateddisposableDB/APIfixture04.1/05.1 for mutations. Existingworkingcatalog/bootstrap/stage1web39752/API90596 excluded from adminmutationacceptance. Fixture request routed04.1/05.1; launch andteardownownership to beexplicit, credentialsnotprinted. No currentserverchanges.

## Public CMS / admin combined build coordination

Coordinator00assigned03.1publicCMSconsumerhome/header/footer/layout/mediarewrite, disjoint10admin/auth. Hold allNextbuilds until10+03.1sourcefreezescombined; currentinprogresssourceerrors not infrastructurefailures. Existingstage1API90596/web39752unchanged. Security13.1thread01a21a5a-0915-7be0-ad39-53b1b809ef54 andQA14.1 separate.

Independent contractsrefresh: npm run contracts:accounts:check exit0, types→accounts compiled successfully, OpenAPIparity96operationsPASS; npm run test --workspace=@ryadom/accounts-types --workspace=@ryadom/types exit0/accounts23+base34=57PASS. No install/manifestschange, noDB/APIinprogressbuild. Refreshedcompiledexports availableto04.1/05.1 andfutureconsumers. This supersedesprevious74op/52test snapshot withoutclaimingadminimplementationready.

Integrationhold97thcontract: coordinator00reports fundedSubscriptionSummary actualpaidperiod/nullunfunded + founderagreement operationpending01.1finalfreeze. Noinstallmanifestunchanged; current96compiledsnapshotretaineduntilfreeze. Requested10admin-demo+03.1publicCMS scopedtypecheck/tests/sourcefreeze foronesolecombinedNextbuild. Critical13.1draftbypass/equaladmin/mediaarchive findings releaseblockers, fixes/regressionevidence requested05.1. Inprogresssnapshoterrors not infrastructurebug. Currentweb39752/API90596retained; norestart/newauthrelease.

## FINAL97 contract targeted acceptance03:19MSK

01.1explicitfinalfreeze received. Independent npm run contracts:accounts:check exit0/types→accountsbuildPASS/OpenAPI97parityPASS; npm run typecheck --workspace=@ryadom/accounts-types exit0; npm run test --workspace=@ryadom/accounts-types --workspace=@ryadom/types exit0/3files/59PASS (accounts25+base34). NewcompiledFounderAgreement/OwnerFundedSubscriptionexportsready; consumers04.1/05.1/10notified. Externalcustomeragreement/anchor/IANA timezone recordedbeforemanualfundsconfirmation; fundedSubscriptionSummary nullablewhennoactualfundedperiod, nofakedremainingdays. Noinstall/lockmutation/restart/Nextbuild. CombinedUI/CMSfreeze/securityfix/isolatedfixturegatesremainopen.

ProducerbridgequoteId/agreementIdfreeze independentlyreverified: contracts:accounts:check types→accountsbuildPASS/parity97PASS, accountstypecheckPASS, accounts25+base34=59testsPASS. Consumers04.1/05.1/10notified, nomanifest/install/restart.

AdminfixtureQAplanning: confirmedNextrewritebuildtimeAPI_URLcoupling vsSSRruntimeAPI_URL. Chosenfutureorchestration aftercombinedfreeze/build/securityfixes:17temporarilystopsstableAPI90596, disposablefixtureAPIbindsfixed3001, isolatedNextpreview3171 usesgenuinefrozenrewrite+SSRto3001; assertfixtureidentitybeforemutations, noresponse/authmock. FinallycleanupfixtureexactDB/processesandrestorestableAPI. QA14.1preparesrunner,04.1helperfixedportoptionneeded; notlaunchednow. Explicitdevloopbackcookiepolicyonly(notproductionbypass), limitationrecorded. Existingpreviewunchangeduntilagreedreadywindow.

## Resume checkpoint03:32MSK

Userdirectedcontinueall accepted, medium preserved. Re-readcurrentAGENTS/PROJECT-STATUS/ownhandoff/Sitesfull+portablepreview. Categories architecture/API/database/security/testing/runtime/docs, specialistUI/GIS/securityskillsstillunavailable. Existinglisteners confirmed3001PID36312(node dist/main.js),3000PID37496(Next),3171absent; no duplicateprocessstarted. These correspond priorownedAPI90596/web39752, oldstage1buildnotadminreadiness. Ownershipcurrent04.1appsapi/05.1db/10adminUI/03.1publicCMS/13.1security/14.1QA; rootinstall/lock/runtime/Nextbuildonly17.

Final98contracttargeted independentchecks: npm run contracts:accounts:check exit0(types→accountsbuild/OpenAPI98parity), accountstypecheckexit0, accountstests27+original34=61PASS. POSTcsrf JSON{} canonicalexactOrigin+FetchMetadata/authlimiter, onlypriorCSRFexemption; typedhomepageHeroCTAready. Consumersnotified. No installunchangedcontracts.

10admin-demo plainTS/noownmanifest; webrequiresexplicitaccounts-types0.1.0 currentlymissing. Requested00one-manifestassignment/owneredit to respect17noappscodeboundary.03.1authorizedmediarewriteimplemented, homepage metadatafixassignmentrouted00. API04.1NOTfrozen, realDBRedisHTTPinitialPASSownerreport, extendingtests/securityfixes. DB13.1draft/equaladmin/mediaarchivefixregressionspending. QA14.1runnerinprogress exactplanned Vitestadmin.runtimeconfig, conditionalflags/adminfixture3001+web3171. MustproveuniquemarkerSSRauth/me+genuinewebrewritebeforemutations; failclosednofallbackworkingAPI. StableAPIstop/restoreonly17afterfreeze. Noactualadminrunner/build/restartyet; sourceinprogressnotinfraerror.

Resume follow-up:00explicitlyassignedONEmanifestedit apps/web/package.json exactaccounts-types0.1.0. Addedonlydependency, serialnpm install exit0 up-to-date/audited278/vulnerabilities0. No ci/unrelatedappsedit.03.1narrowhomepage metadataassignmentconfirmed00. Newroot.env.example PUBLIC_MEDIA_ORIGIN fixedlocalweborigin127:3000 andREADME boundary documented, APIadapterimplementationstill04.1inprogress so noactivationclaim. QAfixturemustexplicit3171mediaorigin, neverHostderived.

Retainedsessionpolls39752+90596confirmalive, HTTPweb/andAPIhealth/live200. Runtimeenv3testsPASS.10sourcefrozen8unit/typecheckownerPASS;03.1ready121webtests/typecheckPASSpendingassignedmetadatafix;API/DBsecuritytests ongoing. NoNextbuild/restartyet.

UIcombinedfreezesreceived10+03.1 (03:36MSK), homepage metadatafixedassigned00. Independent npm run typecheck --workspace=@ryadom/web exit0; npm run test --workspace=@ryadom/web exit0/10files/125PASS. NoNextbuilduntilAPI/DBsourcefreeze/securitygates. API04.1PUBLIC_MEDIA_ORIGINloader nowrequiresHTTPSproduction, optionalunset→photosomitted; explicitdevelopment+loopbackHTTPflagonly. Rootenvexample correctedunsetdefault/commenteddevexample, READMEclarified, noHost/CORSinference. QAhelperexplicit3171devorigin, stablelocalproductionenvunset. This supersedes earlierplaceholderHTTPexample; noactivation/restart.

Prebuildfreezecheckpoint03:39: DB05.1finalfreeze received, independentDBbuild/typecheckexit0,003/admin/accountsSHA256matchesownerfreeze. No working003migration. Owner27PostGISchecks recordedexternalnotrerun. UI10+03.1freeze125webtests/typecheckindependentPASS; additionaltargetedadmin/CMS23PASS. QAtsc/discovery1runtimecasePASS,noexecution. API04.1sourcefreezependingfinaltestresult(ingressprelookupfix), noNextbuild/restartuntilPASS. Fixedfixture3001helperorigin/portexists; stableweb3000willalsostopduringfixturetoavoidpreviewpointingtestDB. Restoreownedruntimefinally, exactuniqueDBcleanupviahelper.

## Combined build / isolated runtime evidence03:42–03:48

APIindependenttypecheck/buildPASS. SoleNextproductionbuild with explicitAPI_URL127:3001 andmapconnect8089 exit0 compile4.8s/TS8.6s; admin/authdynamicroutespresent. No duplicatebuild. Oldweb39752/API90596stoppedonlycontrolledwindow.

ActualQA admin-isolated-01 exit1 atSSRproofbeforeCRM: uniqueproxy401/browserPOSTcsrf/password-onlydenialPASS, MFAoverviewvisible, predicatewronglyexcludedNodeUndicifetch sec-fetch-mode:cors. QAownerfixedtestonly, retainedfailure.02 exit1 categoryexactlabelselector; genuineSSRuniqueAPIwithcookie+noOrigin/noReferer/noFetchSite/noFetchDest confirmed, browserMFA/CRMUI→DB→reload/noinventedpaidperiod/phoneaudit+routehidePASS. Nativewrappedmultiple-selectneededlistboxrole, QAselectorfixonly.03 exit1businessdialogstaysafterSave; fieldsalreadyhave stepany, no confirmednumericbug.04 diagnosticexit1samepoint: allcontrolsvalid, alert429RATE_LIMITED exact /api/v1/admin/catalog/businesses; notschema/nativeinputdefect. No privatevalues/tokens/seeds saved, onlytransportheaderbooleans+safealert/fieldvalidity/errorcode/path. CRMmutations onlyfreshUUIDtestDB, no workingcustomer/paidrows.

Eachrunnerfinallyclosedbrowser/ownNext3171/fixtureAPI3001/droppedfixtureDB; portscheckedabsentbeforestablerestore. No skippingSSRproof orfakecookies. CurrentQAblockerneedsprecisebucket/TTLinternaltrace orsplitfreshCRM/business/CMSfixtures per00, notrelaxproductionlimits/guess15minwait/repeatedsamefullrun. UIpossiblefetchfanout/looprequiresownerdiagnosis. QA14.1/04.1routed. HTTPdevelopmentloopbackcookiesonly; HTTPSproductioncookiegate notclaimed.

Beforeworking003: pre-admin-003.dump custombackup+SHArestorecheckPASS11tables/85cities/2753places/scratchdrop.003_accounts_admin.sql migrationPASS; grant-admin-runtimePASS, noauthusers/seed/bootstrap. post-admin-003.dump+SHArestorecheckPASS37tables/85cities/2753places/scratchdrop. Workingcatalogpreserved. F13.1-06currentrevieweditor-selfapprovalfix newadmin.ts0F8FC...compiled6A2D...; ownerDB11/HTTP4targetedPASS, independent13.1confirmationpending. No003changeafterapply.

RestoredruntimeGISreadsmoke /health/ready200DB/Redis/mapavailable/geocoder+routerconfigured, cities200/85, platformreviews200, mapconfig200available, Smolenskcafe10km191schemaPASS. Duringisolatedwindow06readonlyobservedunconfiguredGISinfixture, notstableregression. Last restoredstableowner17 sessions API52725/web14799, URLs127:3001/3000; accountsdisabled/noHTTPproductionbypass/PUBLIC_MEDIA_ORIGINunset, nofakeadmincredentials. These supersedeearlierIDs. ExistingcombinedUIpreviewreadypublic/demo, authenticatedacceptancestillpartialuntilremainingQAgates.

## Resume Sites1.2 and prefetch regression acceptance04:06+

ReadupdatedSites1.2.0-relayfull+portablelocalreference; localNext/Nest/PostGISpreserved,nopublish. InflightCMS06wasalreadyexit0(9.72s), checkpointactualproxy/passworddenial/MFA/SSR/CMSA→draftB→publishBactualSSRrefresh/logoutPASS, ingress97/private80/auth10/write4/public10,0denials. Ports3000/3001/3171freeverified,noduplicates.

New10prefetchfalseprivateLinksfreeze→independentwebtypecheckPASS+soleNextbuildPASScompile1.35s/TS5.6s. Freshcatalog07sameactualproductionquotas/no62wait: exit0/14.43s, genuineproxy/MFA/SSR/licensedbusinesscreate/edit/publish/publicnear+detail/archive/logoutPASS; ingress75/private56/auth11/write5/public3,0denials/0failures. Comparedcatalog05ingress127/private102/7denials; observedreductionconfirmsminimalprefetchfixfunctionalundercurrenttest, notloadcertification. CMS06successfulcheckpointnotrepeatedunchanged.

Stableowner17restoredlatestAPI45032/web49216; http127:3001/3000,accountsdisabled,PUBLIC_MEDIA_ORIGINunset,GISenvrestored. HTTPready200DB/Redis/mapavailable/geocoder+routerconfigured,cities85/reviews/mapconfig200;home/admin-demo/auth-admin200. LatestDB5minticketcompiledincludedbynewAPIprocess. Stableaccountsdisabledmeansadmin-publicactual401testmustuseenabledisolatedfixture,notsubstitute503asauthorizationPASS.

Demo01previous10PASS7FAILalltransientstreamingfallbackstrictmainselectors. QAownerwaitonevisiblemainfix→demo02actual17tests:16PASS1FAIL/25.8s. All6ownerswidths+6businesswidthsaxe/overflowPASS;35fictionalownerslocaledit/nonroutablephone/days/isolation+35actualshowcaseIDs/provenancePASS. RemainingdialogTabfocusescapes(containsactiveElementfalse)line135, routed10/14.1withtrace/screenshot,notwaived. Anonymouspublic10testsisolatedslicehelperbeingfinalizedwithboundedchildcleanup. Noquotalimitsweakened,nokeys/PIIcaptured.

## 98-operation snapshot verified / new source window04:12MSK

Sites1.2.0-relay fullyread+portableapplied. Explicit10dialogfreeze→soleNextbuildPASS1.34s/TS3.0s. public09freshenabledfixture actual10/10PlaywrightPASS9.4s+outerVitestPASS16.89s. RealanonymousHTML/API401/no-store/case-slashguards/browserPOSTcsrf+invalidcredential401/6loginwidthsaxePASS.09fixwasQAalertscopeonly, old08failurepreserved. Fixturemarker/genuineSSRproof beforemutations retained, cleanupclosedallfixtureports/UUIDDB.

Restoredlateststableowner17 API67419/web47937, 127:3001/3000, GISconfigured/accountsdisabled/PUBLIC_MEDIA_ORIGINunset. HTTP/,/admin/demo/owners,/admin/demo/businesses,/auth/admin200. Openedadmin-demoownersviaopen_in_codex(queued). admin-dialog-03onlyfailedregression rerunPASS1/1(Tab+ShiftTab/Escape/focusrestore). Existing16demo02PASSretained incl12responsiveaxeand35fictionalowners/35reallicensedshowcaseisolation; doNOTclaimfresh17/17run. Noquotaschanged.

10sourceeditwindowreleasedafterpublic/dialogcompletion forhumanmusthavecityregion/geocodemanual/photoattachment+new100contractlistinglookup; unusedbusiness-fieldshelperwasnotwiredincurrentbuild,nofunctionalclaim. Current98snapshotproofretained, newfreezesneededbeforefuturebuild. Noauthworkingbootstrapuntilsecureoperatorconfiguration,nooutboundmessages/payments/fakepaidclaims.

100-operation follow-uptargeted17: contracts:accounts:check(types→accounts)buildPASS/parity100PASS, accountstypecheckPASS, accounts30+base34=64testsPASS/4files. No manifest/install/serverrestart. API/DB/UInewlookup implementation assignedowners, newsourcewindowongoing. Earlier98functionalbrowserPASS remainsvalidonlyitsmeasuredscope; notautomaticallyproof100newoperations. CurrentpreviewAPI67419/web47937 unchanged.

100listinglookupownerfreezesaccepted: DB45FC1444... realPostGIS13PASS/typecheck/buildownerPASS, independent17DBbuild/typecheckPASS. API5E230139... actualfinanceHTTP1selectedPASS/3intentionalfilter (notfull4claim), currentrefs/bounds/roleisolation+manualreceiptguardsownerPASS; independent17APItypecheck/buildPASS. No schema/grants/deps/installchanges, stableoldprocessnotautomaticallynew100runtime. UI10forms+lookupfreezeawaited, QA14.1targetednewselectors/fixtureoperatorworkflowrequested. Prior98snapshotgatespreserved.
