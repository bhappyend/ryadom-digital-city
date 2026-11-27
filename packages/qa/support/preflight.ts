export async function preflight(keys: ('BASE_URL' | 'API_URL')[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (!value) throw new Error(`QA BLOCKED: ${key} is required; obtain the running service URL from integration owner 17.`);
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/') {
      throw new Error(`QA BLOCKED: ${key} must be an HTTP(S) origin without credentials/path.`);
    }
    const response = await fetch(value, { signal: AbortSignal.timeout(8_000), redirect: 'error' });
    // API origin may correctly return 404: connectivity is checked here, endpoint behavior in tests.
    if (key === 'BASE_URL' && !response.ok) throw new Error(`QA BLOCKED: ${key} returned HTTP ${response.status}.`);
  }
}
