// Post-deploy check that forged client-IP headers cannot bypass the API rate limit (F-18).
// Sends 2 × limit + 10 requests from this machine, each with fresh random client-IP headers, in parallel batches so they land inside one rate-limit window even over a slow link.
// If the edge and the API key clients correctly, every request lands in this machine's one bucket
// and 429s appear once the limit is passed. If none appears, forged headers (or rotating proxy
// addresses) are giving requests separate buckets: do not go public until that is fixed.
//
//   node scripts/check-rate-limit.mjs https://<api-host> [limit=120] [--plain]
//
// --plain sends no forged headers, to tell "headers are trusted" apart from "the limit never
// keys on this client at all". Read-only (GET /health). This machine's bucket is exhausted for a
// minute afterwards.
const args = process.argv.slice(2);
const plain = args.includes("--plain");
const [base, limitArg] = args.filter((a) => !a.startsWith("--"));
if (!base) {
  console.error("usage: node scripts/check-rate-limit.mjs <api base url> [limit] [--plain]");
  process.exit(2);
}
const limit = Number(limitArg ?? 120);
// Twice the limit: if this client is one bucket, about `limit` are served and the rest refused.
// Split buckets (forged headers trusted, or a rotating proxy pool keyed by socket address) serve
// far more, and can also refuse a few, so refusals alone prove nothing.
const total = limit * 2 + 10;
const BATCH = 40;
const WINDOW_MS = 60_000;
const rnd = () => `${1 + Math.floor(Math.random() * 222)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

// Behind Cloudflare (Render's edge), a client-set CF-Connecting-IP is refused with 403, which is
// what makes CLIENT_IP_HEADER=cf-connecting-ip safe there. Report what this edge does with it.
const cf = await fetch(new URL("/health", base), { headers: { "cf-connecting-ip": rnd() } }).then((r) => r.status, () => 0);
console.log(
  cf === 403
    ? "edge refuses a client-set CF-Connecting-IP (403): CLIENT_IP_HEADER=cf-connecting-ip is safe here"
    : `edge answered ${cf} to a client-set CF-Connecting-IP: do NOT use CLIENT_IP_HEADER=cf-connecting-ip here`,
);

const started = Date.now();
const statuses = [];
for (let sent = 0; sent < total; sent += BATCH) {
  const n = Math.min(BATCH, total - sent);
  const batch = Array.from({ length: n }, () => {
    const ip = rnd();
    // Headers an edge may pass through unchanged; trusting a client-set copy of any of them shows
    // up as a bypass. CF-Connecting-IP is checked separately above.
    const headers = plain ? {} : { "x-forwarded-for": ip, "x-real-ip": ip, "true-client-ip": ip };
    return fetch(new URL("/health", base), { headers }).then((r) => r.status, () => 0);
  });
  statuses.push(...(await Promise.all(batch)));
}
const elapsed = Date.now() - started;
const limited = statuses.filter((s) => s === 429).length;
const other = statuses.filter((s) => s !== 200 && s !== 429);
const served = statuses.filter((s) => s === 200).length;
const mode = plain ? "plain requests" : "rotating forged X-Forwarded-For / X-Real-IP / True-Client-IP";

console.log(`${total} requests (${mode}) in ${(elapsed / 1000).toFixed(1)} s: ${served} ok, ${limited} rate-limited, ${other.length} other`);
if (other.length) {
  console.log(`FAIL unexpected statuses: ${[...new Set(other)].join(", ")}`);
  process.exit(1);
}
if (served <= Math.ceil(limit * 1.05) + 5) {
  console.log(`PASS the limit held: ${served} of ${total} served to this client in one window (limit ${limit})`);
} else if (elapsed > WINDOW_MS * 0.8) {
  console.log("INCONCLUSIVE requests were too slow to exceed the limit within one window; rerun from a faster link or with a lower limit");
  process.exit(3);
} else {
  console.log(`FAIL ${served} of ${total} were served, well over the limit of ${limit}: this client is not being keyed as one bucket. The limit uses fixed one-minute windows, so a window resetting mid-run can serve up to twice the limit: rerun once after a minute's pause before concluding`);
  process.exit(1);
}
