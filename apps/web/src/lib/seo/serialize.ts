import 'server-only';

export type JsonLdValue = string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue };

/** JSON roundtrips as data, while HTML script terminators and JS separators cannot escape the script. */
export function serializeJsonLd(value: JsonLdValue): string {
  const escapes: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/gu, character => escapes[character]!);
}
