import { chromium } from "playwright";

async function testWalletConnect() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });

  const account = "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6";
  const chainId = 31611;

  await context.addInitScript(({ account, chainId }) => {
    let current = chainId, accounts = [account], authorized = false;
    const listeners = {};
    const emit = (event, v) => (listeners[event] ?? []).forEach(f => f(v));
    const wallet = {
      request: async ({ method, params }) => {
        if (method === "eth_accounts") return authorized ? accounts : [];
        if (method === "eth_requestAccounts") { authorized = true; emit("accountsChanged", accounts); return accounts; }
        if (method === "eth_chainId") return `0x${current.toString(16)}`;
        if (method === "net_version") return String(current);
        if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain") {
          current = parseInt(params[0].chainId, 16);
          emit("chainChanged", `0x${current.toString(16)}`);
          return null;
        }
        return "0x0";
      },
      on: (e, f) => (listeners[e] ??= []).push(f),
      removeListener: (e, f) => { listeners[e] = (listeners[e] ?? []).filter(x => x !== f); }
    };
    window.ethereum = wallet;
    const send = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
      detail: {
        info: {
          uuid: "00000000-0000-4000-8000-000000000001",
          name: "MetaMask",
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><circle cx='16' cy='16' r='14' fill='%23F6851B'/></svg>",
          rdns: "io.metamask"
        },
        provider: wallet
      }
    }));
    window.addEventListener("eip6963:requestProvider", send);
    send();
  }, { account, chainId });

  const page = await context.newPage();
  console.log("Navigating to https://musd-reach.vercel.app/app...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Look for connect wallet button
  const connectBtn = page.getByRole("button", { name: /connect/i }).first();
  if (await connectBtn.isVisible()) {
    console.log("Clicking connect button...");
    await connectBtn.click();
    await page.waitForTimeout(1000);

    // Look for MetaMask in chooser
    const mmOption = page.getByText(/MetaMask/i).first();
    if (await mmOption.isVisible()) {
      console.log("Selecting MetaMask in chooser...");
      await mmOption.click();
      await page.waitForTimeout(2000);
    }
  }

  const pageText = await page.textContent("body");
  console.log("Connected check:", pageText.includes("0x0F57") ? "CONNECTED!" : "Not connected yet");

  await page.screenshot({ path: "./connected_test.png" });
  console.log("Screenshot saved to connected_test.png");

  await browser.close();
}

testWalletConnect().catch(console.error);
