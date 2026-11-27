import { NominatimGeocoder, ValhallaRouter } from '@ryadom/gis';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createCatalog } from './repository.js';
import { RedisRateLimiter } from './rate-limit.js';
import { createAccounts } from './account-runtime.js';
import { loadPublicMediaOrigin } from './media-origin.js';

async function main() {
  const config = loadConfig();
  const catalog = createCatalog(config.databaseUrl, loadPublicMediaOrigin());
  const limiter = new RedisRateLimiter(config);
  const accounts = await createAccounts(config.origins);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await limiter.connect();
    app = await createApp({ config, catalog, limiter, ...(accounts ? { accounts } : {}), geocoder: new NominatimGeocoder(config.geocoder), router: new ValhallaRouter(config.router) });
    await app.listen(config.port, config.host);
  } catch (error) {
    await app?.close(); await catalog?.close(); await limiter.close(); await accounts?.close(); throw error;
  }
  let closing = false;
  async function close() {
    if (closing) return; closing = true;
    await app?.close(); await catalog?.close(); await limiter.close(); await accounts?.close();
  }
  process.once('SIGINT', () => { void close(); });
  process.once('SIGTERM', () => { void close(); });
  // Never log URLs, query strings, coordinates, bodies, credentials or client IPs.
  console.info(`Ryadom API listening on port ${config.port}`);
}
void main().catch(() => { console.error('API startup failed; check deployment configuration'); process.exitCode = 1; });
