// Public, read-only provenance and blocklist observations. A negative list lookup is not a clearance.
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const out = new URL("../evidence/product-review/security/", import.meta.url);
mkdirSync(out, { recursive: true });
const host = "musd-reach.vercel.app";
const results = { checkedAt: new Date().toISOString(), host, observations: [] };
for (const url of [
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/src/config.json",
  "https://raw.githubusercontent.com/MetaMask/eth-phishing-detect/main/README.md",
  "https://api.github.com/repos/TheWeirdDee/musd-reach/commits/HEAD/status",
  "https://api.github.com/repos/TheWeirdDee/musd-reach/deployments",
  "https://musd-reach.vercel.app/",
]) {
  try {
    const res = await fetch(url, { headers: { "user-agent": "Reach-read-only-security-review" }, signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    const item = { url, status: res.status, sha256: createHash("sha256").update(text).digest("hex"), bytes: Buffer.byteLength(text) };
    if (url.endsWith("config.json") && res.ok) {
      const cfg = JSON.parse(text);
      item.matches = Object.fromEntries(Object.entries(cfg).filter(([, v]) => Array.isArray(v)).map(([key, values]) => [key, values.filter((d) => typeof d === "string" && (host === d || host.endsWith(`.${d}`)))]));
      item.listVersion = cfg.version;
    } else if (url.includes("api.github.com")) item.response = JSON.parse(text);
    else if (url === `https://${host}/`) {
      item.headers = Object.fromEntries([...res.headers].filter(([key]) => /content-security|x-vercel|content-type|x-frame|referrer|permissions/i.test(key)));
      item.scripts = [...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
      item.icons = [...text.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((m) => m[0]);
      item.deploymentIds = [...new Set(text.match(/dpl_[a-zA-Z0-9]+/g) ?? [])];
    }
    results.observations.push(item);
    console.log(`${res.status} ${url} ${item.matches ? JSON.stringify(item.matches) : ""}`);
  } catch (e) { results.observations.push({ url, error: e.message }); }
}
writeFileSync(new URL("public-observations.json", out), JSON.stringify(results, null, 2));
