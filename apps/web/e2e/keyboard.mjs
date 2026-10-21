import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const res = [];
const ck = (n, ok, d = "") => { res.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? " — " + d : ""}`); };
// node e2e/keyboard.mjs [baseUrl]
await p.goto((process.argv[2] ?? "http://localhost:3000") + "/app/wrap", { waitUntil: "networkidle" });
await p.keyboard.press("Tab");
const first = await p.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), visible: getComputedStyle(document.activeElement).position }));
ck("first Tab lands on skip link", first.text === "Skip to content", first.text);
await p.keyboard.press("Enter");
ck("skip link moves focus target to main", await p.evaluate(() => location.hash === "#main"));
const seen = [];
for (let i = 0; i < 40; i++) {
  await p.keyboard.press("Tab");
  const info = await p.evaluate(() => {
    const el = document.activeElement; const cs = getComputedStyle(el);
    return { tag: el.tagName, cls: String(el.className).slice(0,60), label: el.getAttribute("aria-label") || el.id || el.textContent?.trim().slice(0, 30), outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 };
  });
  seen.push(info);
}
ck("Tab reaches the wallet button", seen.some((s) => /Connect wallet/.test(s.label)));
ck("Tab reaches the amount input", seen.some((s) => s.label === "wrap-amount"));
ck("Tab reaches the asset radio buttons", seen.some((s) => /MUSD/.test(s.label) && s.tag === "BUTTON"));
const noOutline = seen.filter((s) => !s.outline && s.tag !== "BODY" && s.tag !== "NEXTJS-PORTAL");
ck("every focused element shows a focus outline", noOutline.length === 0, JSON.stringify(noOutline));
await b.close(); process.exitCode = res.every(Boolean) ? 0 : 1;
