import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
// node e2e/axe.mjs [baseUrl]
const BASE = process.argv[2] ?? "http://localhost:3000";
const routes = ["/", "/app", "/app/wrap", "/app/portable/new", "/app/redeem", "/app/history", "/proof", "/proof/testnet-2026-10-20T15-05-14-568Z", "/proof/testnet-2026-10-21T11-23-33-084Z", "/status", "/integrations", "/developers", "/risks", "/app/transfers/0x69691ea22cce36294b74bb9538fd2b62ec953f00029580846571fb55ad89aa32?tx=0x680490b824bf9cc28c2ce11fac8389bb7a8916598767288a55f60ef6b1704c45&dir=ISSUE"];
const b = await chromium.launch();
const summary = {};
for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, reducedMotion: "reduce" });
  for (const r of routes) {
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForTimeout(1500);
    await p.addScriptTag({ content: axeSrc });
    // Never report "no violations" for a page axe did not actually scan.
    if ((await p.evaluate(() => typeof window.axe?.run)) !== "function") throw new Error(`axe did not load on ${r}`);
    const res = await p.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } }));
    for (const v of res.violations) {
      const k = `${v.impact} ${v.id}`;
      summary[k] ??= { help: v.help, routes: new Set(), nodes: 0, sample: v.nodes[0]?.target?.join(" ") };
      summary[k].routes.add(`${r.split("?")[0].slice(0, 40)}@${w}`);
      summary[k].nodes += v.nodes.length;
    }
    await p.close();
  }
  await ctx.close();
}
await b.close();
const order = { critical: 0, serious: 1, moderate: 2, minor: 3 };
for (const [k, v] of Object.entries(summary).sort((a, b) => order[a[0].split(" ")[0]] - order[b[0].split(" ")[0]]))
  console.log(`${k} | ${v.help} | nodes ${v.nodes} | e.g. ${v.sample} | ${[...v.routes].slice(0, 4).join(", ")}${v.routes.size > 4 ? ` +${v.routes.size - 4}` : ""}`);
console.log(Object.keys(summary).length ? "" : "NO VIOLATIONS");
