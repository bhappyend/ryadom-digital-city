# @ryadom/api

NestJS API этапа 1, порт 3001, `/api/v1`. Общий контракт: `@ryadom/types`, [OpenAPI](../../docs/openapi.yaml). Подробности endpoints, env, безопасности и проверок — [docs/API.md](../../docs/API.md).

Из корня checkout после согласованного владельцем установки `npm ci`:

```powershell
npm run build:shared
npm run typecheck --workspace=@ryadom/api
npm test --workspace=@ryadom/api
npm run build --workspace=@ryadom/api
npm run dev:api
```

Для production build локально: `npm run start:api`. Корневой runtime wrapper читает `.env` и передаёт из `infra/.env.local` только APP_DATABASE_URL и REDIS_URL. Миграции/seed/grants выполняет DB workflow, API не получает административный DATABASE_URL. Прямой `npm run start --workspace=@ryadom/api` использует уже переданные process env.

```powershell
npm run smoke --workspace=@ryadom/api
$env:API_DATABASE_TEST='1'
npm test --workspace=@ryadom/api
Remove-Item Env:API_DATABASE_TEST
```

Smoke читает существующий каталог без вставок. Опциональный DB HTTP test создаёт только временную `ryadom_apitest_<uuid>` БД, применяет миграции и синтетическую fixture, проверяет durable report и удаляет эту БД. Ему нужны доступный PostGIS, Redis и локальные admin/runtime credentials из ignored `infra/.env.local`; не запускать против production.

`/health/live` — живой процесс, `/health/ready` — соединения DB и Redis доступны; это не проверка полноты каталога или GIS-покрытия. Без DB чтение каталога возвращает 503. Без Redis reports закрыты, чтение ограничено локально. Без GIS нет выдуманных точек или маршрутов.
