# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Supply a reviewed Debian Node 22/24 image by immutable registry digest.
ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Dockerfile-specific ignore excludes secrets and local generated data.
COPY . .
RUN node -e "const f=require('node:fs'); for(const p of ['.git','.env','.env.accounts.local','infra/.env.local','infra/backups','infra/data','data/osm','data/cities/geonames-RU.zip','packages/qa/artifacts','node_modules']) if(f.existsSync(p)) throw Error('Forbidden build context: '+p); if(!f.existsSync('data/cities/showcase35.json')) throw Error('Missing licensed showcase')"
RUN npm ci --no-audit --no-fund
RUN npm run build:shared && npm run build --workspace=@ryadom/api
FROM build AS web-build
ARG PUBLIC_SITE_URL
ARG WEB_MAP_CONNECT_ORIGINS=""
ENV API_URL=http://api:3001 PUBLIC_SITE_URL=${PUBLIC_SITE_URL} WEB_MAP_CONNECT_ORIGINS=${WEB_MAP_CONNECT_ORIGINS}
RUN npm run build --workspace=@ryadom/web

# Administrative tools intentionally retain tsx/compiler; never exposed on a port.
FROM build AS tools
ENV NODE_ENV=production
USER 10001:10001
ENTRYPOINT ["node", "node_modules/tsx/dist/cli.mjs", "packages/db/src/cli.ts"]

FROM build AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p /app/apps/web/.next/cache /var/lib/ryadom/media && chown -R 10001:10001 /app /var/lib/ryadom
COPY --from=production-dependencies --chown=10001:10001 /app/node_modules ./node_modules
# Next loads next.config.ts at startup; retain its transpiler after pruning dev tools.
COPY --from=build --chown=10001:10001 /app/node_modules/typescript ./node_modules/typescript
COPY --from=production-dependencies --chown=10001:10001 /app/packages ./packages
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
USER 10001:10001

FROM runtime AS api
COPY --from=build --chown=10001:10001 /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=10001:10001 /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]

FROM runtime AS web
COPY --from=web-build --chown=10001:10001 /app/apps/web/.next ./apps/web/.next
COPY --from=web-build --chown=10001:10001 /app/apps/web/public ./apps/web/public
COPY --from=web-build --chown=10001:10001 /app/apps/web/package.json /app/apps/web/next.config.ts ./apps/web/
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "../../node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
