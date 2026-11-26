export type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_PARAM_LENGTH = 500;

/** One-shot messages: shown once after a redirect, never carried into links or later actions. */
const TRANSIENT_KEYS = ["error", "result"] as const;

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

/** The part of the query that describes the view (filters, sort), without one-shot messages. */
export function withoutMessages<T extends Record<string, string | undefined>>(params: T) {
  const copy: Record<string, string | undefined> = { ...params };
  for (const key of TRANSIENT_KEYS) delete copy[key];
  return copy;
}

export function queryPath(values: Record<string, string | undefined>, base = "/") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** A same-site path to return to after an action, minus any message left from an earlier one. */
export function safeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  const url = new URL(value, "http://local.invalid");
  for (const key of TRANSIENT_KEYS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}`;
}

/** `path` with `error` set to `message`, replacing an error that was already there. */
export function pathWithError(path: string, message: string) {
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("error", message.slice(0, MAX_PARAM_LENGTH));
  return `${url.pathname}${url.search}`;
}
