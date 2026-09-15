/**
 * Where to send someone after they sign in.
 *
 * `?next=` comes from the URL, so it is attacker-controlled: a link to
 * `/login?next=https://example.com` would otherwise turn our sign-in page into a
 * convincing way to bounce a customer onto someone else's site, from a URL that
 * genuinely starts with ours.
 *
 * So only same-site paths survive. `//evil.com` is rejected as well as
 * `https://evil.com` — browsers read a leading double slash as a protocol-relative
 * absolute URL, so a check for "starts with a slash" alone is not enough.
 */
export function safeNext(value: string | string[] | undefined, fallback = '/builder/dashboard'): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  // A backslash is normalised to a slash by some browsers, so `/\evil.com` is the
  // same trick wearing a hat.
  if (candidate.startsWith('/\\')) return fallback;
  return candidate;
}

/**
 * Build a sign-in link that returns to a specific page.
 *
 * Kept here rather than inline at each call site so every one of them encodes the
 * nested query string correctly. The AI builder's prompt is carried this way, and
 * a lost character in that round trip silently discards what the customer typed.
 */
export function loginHref(path: string, mode: 'login' | 'register' = 'login'): string {
  return `/${mode}?next=${encodeURIComponent(path)}`;
}
