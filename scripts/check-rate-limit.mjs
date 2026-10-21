// Post-deploy check that forged client-IP headers cannot bypass the API rate limit (F-18).
// Sends limit + 10 requests from this machine, each with a fresh random X-Forwarded-For and
// X-Real-IP. If the edge and the API key clients correctly, every request lands in this
// machine's one bucket and a 429 arrives by request limit + 1. If none arrives, spoofed headers
// are being trusted: do not go public until TRUST_PROXY / CLIENT_IP_HEADER is fixed.
//
//   node scripts/check-rate-limit.mjs https://<api-host> [limit=120]
//
// Read-only (GET /health). Wait a minute afterwards: this machine's bucket is exhausted.
const [base, limitArg] = process.argv.slice(2);
if (!base) {
  console.error("usage: node scripts/check-rate-limit.mjs <api base url> [limit]");
  process.exit(2);
}
const limit = Number(limitArg ?? 120);
const rnd = () => `${1 + Math.floor(Math.random() * 222)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;

let first429 = 0;
for (let i = 1; i <= limit + 10; i++) {
  const ip = rnd();
  const res = await fetch(new URL("/health", base), { headers: { "x-forwarded-for": ip, "x-real-ip": ip } });
  if (res.status === 429) {
    first429 = i;
    break;
  }
  if (!res.ok) {
    console.error(`FAIL unexpected HTTP ${res.status} on request ${i}`);
    process.exit(1);
  }
}
if (first429 && first429 <= limit + 1) {
  console.log(`PASS rate limit held against rotating forged headers: first 429 at request ${first429} (limit ${limit})`);
} else {
  console.log(`FAIL no 429 within ${limit + 10} requests with rotating forged X-Forwarded-For / X-Real-IP: forged headers are trusted`);
  process.exit(1);
}
