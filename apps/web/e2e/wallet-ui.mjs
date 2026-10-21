// Recipient validation and wallet-chooser regressions (F-16).
//  - An empty recipient while disconnected is not an error; an invalid one is.
//  - A wallet that announces itself over EIP-6963 is listed once, not also as "Browser wallet".
//
//   node e2e/wallet-ui.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];
const check = (n, ok, d = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? ` — ${d}` : ""}`);
};

// Announces a keyless EIP-6963 provider named "Test Wallet" and exposes it as window.ethereum,
// the way MetaMask and Rabby do. It never answers signing requests.
const announce = () => {
  const provider = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x7b7b";
      if (method === "eth_accounts") return [];
      throw Object.assign(new Error("not supported"), { code: 4200 });
    },
    on: () => {},
    removeListener: () => {},
  };
  window.ethereum = provider;
  const info = { uuid: "00000000-0000-4000-8000-000000000001", name: "Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "org.example.testwallet" };
  const send = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", send);
  send();
};

const browser = await chromium.launch();
try {
  for (const [path, id] of [
    ["/app/wrap", "#recipient"],
    ["/app/portable/new", "#lock-recipient"],
    ["/app/redeem", "#mezo-recipient"],
  ]) {
    const page = await browser.newPage();
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    const input = page.locator(id);
    if ((await input.count()) === 0) {
      check(`${path}: recipient field present`, false);
      await page.close();
      continue;
    }
    check(`${path}: empty recipient is not flagged`, (await input.getAttribute("aria-invalid")) !== "true" && (await page.getByText("Enter a valid address").count()) === 0);
    await input.fill("0x1234");
    check(`${path}: invalid recipient is flagged`, (await input.getAttribute("aria-invalid")) === "true");
    await input.fill("0x0F579957D94D1D12Fbb0dE3A495180629098Efe6");
    check(`${path}: valid recipient clears the flag`, (await input.getAttribute("aria-invalid")) !== "true");
    await page.close();
  }

  const page = await browser.newPage();
  await page.addInitScript(announce);
  await page.goto(BASE + "/app/wrap", { waitUntil: "networkidle" });
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Wallet" });
  await dialog.getByRole("button", { name: "Test Wallet" }).waitFor({ timeout: 15000 });
  const names = await dialog.getByRole("button").allInnerTexts();
  check("announced wallet is listed once, without a duplicate 'Browser wallet'", names.filter((n) => /Test Wallet/.test(n)).length === 1 && !names.some((n) => /Browser wallet/.test(n)), names.join(", "));
  await page.close();
} catch (e) {
  check("completed", false, e.message.split("\n")[0]);
}
await browser.close();
process.exitCode = results.every(Boolean) ? 0 : 1;
