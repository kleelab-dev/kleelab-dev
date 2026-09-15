/**
 * Sign-in redirect safety.
 *
 * `?next=` is attacker-controlled, and a sign-in page that forwards to an
 * arbitrary URL is a phishing tool: the link genuinely starts with our domain, so
 * nothing about it looks wrong before the customer has typed their password.
 * That makes this worth a script rather than a comment.
 *
 * Run with `npm run check:auth`.
 */

import { loginHref, safeNext } from '@/lib/auth';

let failures = 0;

function expect(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`PASS  ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
}

const FALLBACK = '/builder/dashboard';

// --- Accepted: same-site paths ---------------------------------------------------
expect('a plain path is kept', safeNext('/builder/new'), '/builder/new');
expect('a path with a query is kept', safeNext('/builder/new?prompt=hello'), '/builder/new?prompt=hello');
expect('an empty value falls back', safeNext(undefined), FALLBACK);
expect('an empty string falls back', safeNext(''), FALLBACK);

// --- Refused: anything that leaves the site --------------------------------------
expect('an absolute https URL is refused', safeNext('https://evil.example/login'), FALLBACK);
expect('a protocol-relative URL is refused', safeNext('//evil.example'), FALLBACK);
expect('a backslash path is refused', safeNext('/\\evil.example'), FALLBACK);
expect('a bare host is refused', safeNext('evil.example'), FALLBACK);
expect('a javascript: URL is refused', safeNext('javascript:alert(1)'), FALLBACK);
expect('a data: URL is refused', safeNext('data:text/html,<script>alert(1)</script>'), FALLBACK);

// --- Duplicated query parameters must not become a way through -------------------
expect(
  'an array takes the first value',
  safeNext(['/builder/new', 'https://evil.example']),
  '/builder/new',
);
expect('an array of only bad values falls back', safeNext(['https://evil.example']), FALLBACK);

// --- The link builder encodes the nested query correctly --------------------------
expect(
  'loginHref encodes a nested query',
  loginHref('/builder/new?prompt=a b&c=d'),
  '/login?next=%2Fbuilder%2Fnew%3Fprompt%3Da%20b%26c%3Dd',
);
expect('loginHref can target register', loginHref('/a', 'register'), '/register?next=%2Fa');

/**
 * The round trip is what actually matters: whatever the link builder produces must
 * decode back to a value `safeNext` accepts. Testing the two halves separately
 * would miss an encoding mistake that only appears when they are used together.
 */
const rebuilt = decodeURIComponent(loginHref('/builder/new?prompt=coffee & tea').split('next=')[1]);
expect('the round trip preserves the destination', safeNext(rebuilt), '/builder/new?prompt=coffee & tea');

if (failures > 0) {
  console.error(`\n${failures} failure${failures === 1 ? '' : 's'}.\n`);
  process.exit(1);
}
console.log('\nAll auth checks passed.\n');
