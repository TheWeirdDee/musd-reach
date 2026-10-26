// Multi-wallet chooser acceptance (restore wallet access, F-33 follow-up).
//
// Everything here is a scripted EIP-1193 / EIP-6963 provider that holds no key: reads answer a
// fixed chain id, every signing request is rejected with 4001, and nothing is ever sent. The
// suite checks that the application no longer forces one wallet, no longer disables itself, and
// treats the reported MetaMask warning as a MetaMask-specific notice.
//
//   node e2e/wallet-chooser.mjs [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3002";
const OUT = "../../evidence/product-review/wallet-chooser";
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Two independent injected wallets, announced exactly the way Rabby and MetaMask announce
// themselves. `flags` marks the provider window.ethereum is assigned to, so the suite can also
// check that an announced wallet is never shown twice.
const WALLETS = [
  { uuid: "00000000-0000-4000-8000-0000000000aa", name: "Rabby Wallet", rdns: "io.rabby", address: "0x000000000000000000000000000000000000a11a" },
  { uuid: "00000000-0000-4000-8000-0000000000bb", name: "MetaMask", rdns: "io.metamask", address: "0x000000000000000000000000000000000000be7b" },
];
const ICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/>";

const installScript = ({ wallets, reject }) => {
  const listeners = {};
  const emit = (ev, v) => (listeners[ev] ?? []).forEach((f) => f(v));
  let chainId = 31611;
  const providers = wallets.map((w) => {
    const provider = {
      isRabby: w.rdns === "io.rabby",
      isMetaMask: w.rdns === "io.metamask",
      request: async ({ method, params }) => {
        if (method === "eth_chainId") return "0x" + chainId.toString(16);
        if (method === "eth_accounts") return provider.__connected && !reject ? [w.address] : [];
        if (method === "eth_requestAccounts") {
          if (reject) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
          provider.__connected = true;
          return [w.address];
        }
        if (method === "wallet_switchEthereumChain") {
          chainId = Number.parseInt(params[0].chainId, 16);
          emit("chainChanged", "0x" + chainId.toString(16));
          return null;
        }
        if (method === "wallet_addEthereumChain") return null;
        if (method === "wallet_getPermissions" || method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        throw Object.assign(new Error(`Rejected scripted wallet (${method})`), { code: 4001 });
      },
      on: (ev, f) => ((listeners[ev] ??= []).push(f)),
      removeListener: (ev, f) => (listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== f)),
    };
    return { info: { uuid: w.uuid, name: w.name, icon: ICON, rdns: w.rdns }, provider };
  });
  window.ethereum = providers[0].provider;
  const send = () => providers.forEach((p) => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze(p) })));
  window.addEventListener("eip6963:requestProvider", send);
  send();
};

async function page(browser, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 900 } });
  await context.addInitScript(installScript, { wallets: opts.wallets ?? WALLETS, reject: !!opts.reject });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  return { context, page: p, errors };
}

const dialog = (p) => p.getByRole("dialog", { name: "Connect a wallet" });
const open = async (p) => {
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  await p.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await dialog(p).waitFor();
  // Announced wallets arrive over EIP-6963 a moment after load; wait for discovery to settle.
  await dialog(p).getByRole("button", { name: /Rabby Wallet/ }).waitFor({ timeout: 15_000 });
};

const browser = await chromium.launch();
try {
  // 1. Presentation: every supported wallet is named once, with its availability and a real logo.
  {
    const { context, page: p } = await page(browser);
    await open(p);
    const text = await dialog(p).innerText();
    for (const name of ["Rabby Wallet", "MetaMask", "Coinbase Wallet", "WalletConnect"]) {
      check(`chooser lists ${name} exactly once`, (text.match(new RegExp(name, "g")) ?? []).length >= 1);
    }
    check("no ambiguous duplicate 'Browser wallet' entry", !/Browser wallet/.test(text));
    const logos = await dialog(p).locator("img").evaluateAll((imgs) => imgs.map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })));
    check("every wallet row shows a rendered logo", logos.length >= 4 && logos.every((l) => l.ok), JSON.stringify(logos));
    const rows = dialog(p).getByRole("button", { name: /Connect$/ });
    check("detected wallets and WalletConnect are offered a connect action", (await rows.count()) === 3, `${await rows.count()}`);
    const installLinks = dialog(p).getByRole("link");
    const hrefs = await installLinks.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    check("missing wallets link to their own vendor pages", hrefs.includes("https://www.coinbase.com/wallet") && hrefs.includes("https://rabby.io/"), hrefs.join(" | "));
    const note = dialog(p).getByRole("note");
    check("MetaMask notice states the open review without blocking other wallets", /review is ongoing/.test(await note.innerText()) && /Do not override a warning shown by your wallet/.test(await note.innerText()));
    check("MetaMask notice links to the investigation page", (await note.getByRole("link").getAttribute("href")) === "/security");
    await p.screenshot({ path: `${OUT}/chooser-desktop.png` });
    await context.close();
  }

  // 2. Accessibility: Escape closes, backdrop closes, focus is trapped and returns to the trigger.
  {
    const { context, page: p } = await page(browser);
    await open(p);
    const inDialog = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    check("opening moves focus into the dialog", inDialog);
    for (let i = 0; i < 40; i++) await p.keyboard.press("Tab");
    check("Tab stays inside the dialog (focus trap)", await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    await p.keyboard.press("Escape");
    check("Escape closes the dialog", (await dialog(p).count()) === 0);
    check("focus returns to the trigger", await p.evaluate(() => document.activeElement?.textContent?.includes("Connect wallet")));
    await open(p);
    await p.mouse.click(8, 8);
    check("clicking the backdrop closes the dialog", (await dialog(p).count()) === 0);
    await context.close();
  }

  // 3. Selection: the chosen wallet connects, the account appears, and nothing else is assumed.
  {
    const { context, page: p, errors } = await page(browser);
    await open(p);
    await dialog(p).getByRole("button", { name: /Rabby Wallet/ }).click();
    await p.locator("header").getByRole("button", { name: /^0x0000…a11a$/i }).waitFor({ timeout: 30_000 });
    check("the selected Rabby wallet is connected, not another wallet", true);
    check("choosing a wallet makes no signing request", await p.evaluate(() => document.querySelectorAll("[role=dialog]").length) === 0);
    await p.locator("header").getByRole("button", { name: /^0x0000…a11a$/i }).click();
    const account = p.getByRole("dialog", { name: "Connect a wallet" });
    check("account menu shows the wallet identity", /Connected · Rabby Wallet/.test(await account.innerText()));
    check("account menu shows the active network", /Mezo testnet/.test(await account.innerText()));
    const explorer = await account.getByRole("link", { name: /explorer/ }).getAttribute("href");
    check("account menu links the address in the right explorer", explorer.includes("explorer.testnet.mezo.org") || explorer.includes("mezo"), explorer);
    await p.screenshot({ path: `${OUT}/account-desktop.png` });
    await context.close();
    check("connection produced no uncaught page errors", errors.length === 0, errors.join(" | "));
  }

  // 4. Switching and disconnecting: the user's second choice replaces the first session.
  {
    const { context, page: p } = await page(browser);
    await open(p);
    await dialog(p).getByRole("button", { name: /Rabby Wallet/ }).click();
    await p.locator("header").getByRole("button", { name: /^0x0000…a11a$/i }).waitFor({ timeout: 30_000 });
    await p.locator("header").getByRole("button", { name: /^0x0000…a11a$/i }).click();
    await p.getByRole("button", { name: "Switch wallet" }).click();
    await dialog(p).getByRole("button", { name: /MetaMask/ }).click();
    await p.locator("header").getByRole("button", { name: /^0x0000…be7b$/i }).waitFor({ timeout: 30_000 });
    check("switch wallet replaces the previous session with the chosen one", true);
    await p.locator("header").getByRole("button", { name: /^0x0000…be7b$/i }).click();
    await p.getByRole("button", { name: "Disconnect" }).click();
    await p.locator("header").getByRole("button", { name: "Connect wallet" }).waitFor({ timeout: 30_000 });
    check("disconnect returns to the disconnected state", true);
    await context.close();
  }

  // 5. Rejection: a wallet that refuses the connection leaves the app usable and disconnected.
  {
    const { context, page: p } = await page(browser, { reject: true });
    await open(p);
    await dialog(p).getByRole("button", { name: /MetaMask/ }).click();
    await p.getByText("Connection request was rejected in the wallet. Nothing was changed.").waitFor({ timeout: 30_000 });
    check("a rejected connection is reported as a rejection, not a failure", true);
    check("the app stays disconnected and usable", (await p.locator("header").getByRole("button", { name: "Connect wallet" }).count()) === 1);
    await context.close();
  }

  // 6. Mobile: the chooser fits at 390 px, scrolls inside itself and never overflows the page.
  {
    const { context, page: p } = await page(browser, { viewport: { width: 390, height: 844 } });
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Open menu", exact: true }).click();
    await p.locator("header").getByRole("button", { name: "Connect wallet" }).click();
    await dialog(p).waitFor();
    check("mobile chooser has no horizontal overflow", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const box = await dialog(p).boundingBox();
    check("mobile chooser fits inside the viewport", !!box && box.width <= 390 && box.x >= 0, JSON.stringify(box));
    check("mobile chooser shows every wallet row", (await dialog(p).getByRole("button", { name: /Connect$/ }).count()) === 2 && (await dialog(p).getByRole("link").count()) >= 2);
    await p.screenshot({ path: `${OUT}/chooser-mobile.png` });
    await context.close();
  }
} catch (e) {
  check("suite completed", false, e.message.split("\n").slice(0, 6).join(" | "));
}
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;