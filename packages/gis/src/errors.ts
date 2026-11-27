import type { ProviderUnavailable as PublicProviderUnavailable } from '@ryadom/types';

export type ProviderFailureReason =
  | 'not_configured' | 'invalid_configuration' | 'timeout' | 'cancelled'
  | 'network_error' | 'http_error' | 'invalid_response' | 'response_too_large' | 'no_route';

/** Safe to map into the public API; never contains upstream URLs, bodies or coordinates. */
export class ProviderUnavailable extends Error {
  readonly code = 'PROVIDER_UNAVAILABLE';
  constructor(
    readonly provider: 'nominatim' | 'valhalla',
    readonly reason: ProviderFailureReason,
    readonly httpStatus?: number,
  ) {
    super(`${provider}: ${reason}`);
    this.name = 'ProviderUnavailable';
  }
}

export class InvalidGisInput extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string) { super(message); this.name = 'InvalidGisInput'; }
}
/** Adapter diagnostics remain internal; API exposes only the shared provider-state contract. */
export function toProviderState(error: ProviderUnavailable): PublicProviderUnavailable {
  const provider = error.provider === 'nominatim' ? 'geocoder' : 'router';
  const reason = error.reason === 'not_configured' ? 'not_configured'
    : error.reason === 'invalid_configuration' ? 'disabled'
      : error.reason === 'timeout' ? 'timeout'
        : error.reason === 'no_route' ? 'coverage_missing' : 'upstream_error';
  return { status: 'unavailable', provider, reason,
    message: provider === 'geocoder' ? 'Геокодер недоступен.' : 'Маршрутизатор недоступен.' };
}
