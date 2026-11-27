/** Decode the provider's latitude-first encoded polyline into GeoJSON [longitude, latitude]. */
export function decodePolyline(encoded: string, precision: 5 | 6 = 6, maxPoints = 50_000): [number, number][] {
  if ((precision !== 5 && precision !== 6) || !Number.isInteger(maxPoints) || maxPoints < 2 || maxPoints > 50_000
    || typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 800_000) {
    throw new Error('Invalid encoded polyline');
  }
  let cursor = 0;
  const readDelta = (): number => {
    let result = 0;
    let shift = 0;
    while (true) {
      if (cursor >= encoded.length || shift > 30) throw new Error('Truncated or oversized polyline component');
      const value = encoded.charCodeAt(cursor++) - 63;
      if (value < 0 || value > 63) throw new Error('Invalid polyline character');
      result += (value & 31) * 2 ** shift;
      if (value < 32) break;
      shift += 5;
    }
    return result % 2 === 1 ? -(Math.floor(result / 2) + 1) : result / 2;
  };
  let lat = 0;
  let lon = 0;
  const coordinates: [number, number][] = [];
  const factor = 10 ** precision;
  while (cursor < encoded.length) {
    lat += readDelta(); lon += readDelta();
    if (Math.abs(lat / factor) > 90 || Math.abs(lon / factor) > 180) throw new Error('Polyline coordinate out of range');
    coordinates.push([lon / factor, lat / factor]);
    if (coordinates.length > maxPoints) throw new Error('Polyline point limit exceeded');
  }
  if (coordinates.length < 2) throw new Error('LineString requires two coordinates');
  return coordinates;
}
