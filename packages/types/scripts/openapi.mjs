// JSON is a YAML 1.2 subset. Keep the .yaml contract dependency-free and reproducible.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const c = require('../dist/index.js');
const { z } = require('zod');
const components = {};
const names = ['Coordinates', 'City', 'Category', 'Provenance', 'Photo', 'Place', 'NearbyPlace', 'Pagination', 'PlacesQuery', 'GeocodeQuery', 'CityQuery', 'ReviewsQuery', 'SlugParams', 'RouteRequest', 'RouteResult', 'GeocodeResult', 'MapConfig', 'ReportRequest', 'ProviderUnavailable', 'ApiError', 'CitiesResponse', 'CategoriesResponse', 'PlacesResponse', 'PlaceResponse', 'StatsResponse', 'PlatformReviewsResponse', 'GeocodeResponse', 'RouteResponse', 'MapConfigResponse', 'ReportResponse'];
for (const name of names) {
  const schema = z.toJSONSchema(c[`${name}Schema`], { target: 'draft-2020-12', io: /(?:Query|Request|Params)$/.test(name) ? 'input' : 'output' });
  delete schema.$schema;
  components[name] = schema;
}
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const content = name => ({ 'application/json': { schema: ref(name) } });
const error = description => ({ description, content: content('ApiError') });
const errors = { '400': error('Invalid bounded input'), '404': error('Resource or route not found'), '413': error('Request too large'), '415': error('Expected application/json'), '429': { ...error('Rate limited'), headers: { 'Retry-After': { schema: { type: 'integer', minimum: 1 }, description: 'Seconds before retry' } } }, '500': error('Internal error; no sensitive details'), '503': error('Explicit unavailable provider; error.provider required') };
function query(name) {
  const schema = components[name];
  return Object.entries(schema.properties).map(([key, value]) => ({ name: key, in: 'query', required: schema.required?.includes(key) ?? false, schema: value, description: 'Exactly one scalar query value; repeated/unknown parameters rejected' }));
}
function operation(id, response, parameters = [], status = '200', body) {
  return { operationId: id, tags: [id.replace(/[A-Z].*$/, '') || id], parameters, ...(body ? { requestBody: { required: true, content: content(body) } } : {}), responses: { [status]: { description: status === '202' ? 'Durably persisted, awaiting moderation' : 'Successful real data, including honest empty results', content: content(response) }, ...errors } };
}
const doc = {
  openapi: '3.1.0',
  info: { title: 'Рядом by Patchvale — stage 1', version: c.CONTRACT_VERSION, description: 'Contract, not a claim of deployed endpoints. WGS84 lon/lat; SI meters/seconds. Zod refinements additionally enforce verified opening hours, non-crossing bounds, http(s) URLs without credentials, route span <=100km, valid maneuver indices, and provider details for unavailable errors. All private/API/geolocation responses use Cache-Control: no-store. No public geocoder fallback.' },
  servers: [{ url: 'http://localhost:3001/api/v1', description: 'Local Nest process; no production host configured' }],
  security: [],
  paths: {
    '/cities': { get: operation('listCities', 'CitiesResponse') },
    '/categories': { get: operation('listCategories', 'CategoriesResponse') },
    '/places/near': { get: operation('nearbyPlaces', 'PlacesResponse', query('PlacesQuery')) },
    '/places/{slug}': { get: operation('getPlace', 'PlaceResponse', [{ name: 'slug', in: 'path', required: true, schema: components.SlugParams.properties.slug }]) },
    '/stats': { get: operation('getStats', 'StatsResponse', query('CityQuery')) },
    '/platform-reviews': { get: operation('listPlatformReviews', 'PlatformReviewsResponse', query('ReviewsQuery')) },
    '/geocode': { get: operation('geocode', 'GeocodeResponse', query('GeocodeQuery')) },
    '/routes': { post: operation('createRoute', 'RouteResponse', [], '200', 'RouteRequest') },
    '/map/config': { get: { ...operation('getMapConfig', 'MapConfigResponse'), description: '200 data.status=unavailable if map is not configured; API failure remains a transport error.' } },
    '/reports': { post: operation('createReport', 'ReportResponse', [], '202', 'ReportRequest') }
  },
  components: { schemas: components }
};
const serialized = `${JSON.stringify(doc, null, 2)}\n`;
const destination = new URL('../../../docs/openapi.yaml', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== serialized) throw new Error('OpenAPI drift: run npm run contracts:generate');
  console.log('OpenAPI matches runtime Zod schemas (10 operations).');
} else {
  writeFileSync(destination, serialized);
  console.log('Generated docs/openapi.yaml (JSON-compatible YAML 1.2).');
}
