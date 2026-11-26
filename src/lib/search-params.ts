export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_PARAM_LENGTH = 500;

/**
 * Next.js hands repeated keys (`?q=a&q=b`) over as arrays; pages expect one string per key.
 * The first value wins and overlong values are cut, so crafted URLs cannot crash a page
 * or fill it with arbitrary amounts of text.
 */
export function singleSearchParams(raw: RawSearchParams): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      (Array.isArray(value) ? value[0] : value)?.slice(0, MAX_PARAM_LENGTH),
    ]),
  );
}
