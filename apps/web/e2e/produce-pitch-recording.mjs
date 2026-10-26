import { chromium } from "playwright";
import { mkdirSync, rmSync, existsSync } from "node:fs";

const TARGET_DIR = "./live_recordings_" + Date.now();
mkdirSync(TARGET_DIR, { recursive: true });

async function produceRecording() {
  console.log("Starting full-screen browser recording on https://musd-reach.vercel.app/...");

  const browser = await chromium.launch({
    headless: true,
    args: ["--window-size=1920,1080", "--no-sandbox", "--disable-dev-shm-usage"]
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: TARGET_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const account = "0x0F579957D94D1D12Fbb0dE3A495180629098Efe6";
  const chainId = 31611;

  // Wallet injection script for live app connection
  await context.addInitScript(({ account, chainId }) => {
    let current = chainId, accounts = [account], authorized = false;
    const listeners = {};
    const emit = (event, v) => (listeners[event] ?? []).forEach(f => f(v));
    const wallet = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        if (method === "eth_accounts") return authorized ? accounts : [];
        if (method === "eth_requestAccounts") {
          authorized = true;
          emit("accountsChanged", accounts);
          return accounts;
        }
        if (method === "eth_chainId") return "0x" + current.toString(16);
        if (method === "net_version") return String(current);
        if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain") {
          current = parseInt(params[0].chainId, 16);
          emit("chainChanged", "0x" + current.toString(16));
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
  page.setDefaultTimeout(60000);

  // ==========================================
  // SCENE 1: 0:00 - 0:12 (Hook and Problem)
  // ==========================================
  console.log("Scene 1: Loading landing page...");
  await page.goto("https://musd-reach.vercel.app/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  // Smooth scroll down to highlight the Problem & Solution
  console.log("Scene 1: Scrolling through Problem & Solution...");
  await page.evaluate(() => window.scrollBy({ top: 480, behavior: "smooth" }));
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.scrollBy({ top: 450, behavior: "smooth" }));
  await page.waitForTimeout(4600);

  // ==========================================
  // SCENE 2: 0:12 - 0:33 (Connect & Wrap)
  // ==========================================
  console.log("Scene 2: Navigating to live App...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  // Connect wallet
  console.log("Scene 2: Connecting wallet...");
  try {
    const connectBtn = page.getByRole("button", { name: /connect/i }).first();
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      await page.waitForTimeout(1500);
      const mmBtn = page.getByRole("button", { name: /MetaMask/i }).first();
      if (await mmBtn.isVisible()) {
        await mmBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  } catch (e) {
    console.log("Connect action caught:", e.message);
  }

  // Interacting with Wrap tab
  console.log("Scene 2: Entering 6.0 MUSD in Wrap tab...");
  try {
    const inputAmount = page.getByRole("textbox").first();
    if (await inputAmount.isVisible()) {
      await inputAmount.fill("6.0");
      await page.waitForTimeout(2500);
    }
  } catch (e) {}
  await page.waitForTimeout(4000);

  // Show explorer transaction link/evidence
  console.log("Scene 2: Showing confirmed wrap transaction on Mezo testnet explorer...");
  try {
    await page.goto("https://explorer.test.mezo.org/tx/0x1fdfc665716297805f5af60961df8808ddfbe9466a8d8b6d2ea10809266099d7", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
  } catch (e) {
    console.log("Explorer navigation:", e.message);
  }

  // ==========================================
  // SCENE 3: 0:33 - 0:51 (Lock & Bridge)
  // ==========================================
  console.log("Scene 3: Returning to Make Portable tab...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  try {
    const makePortableTab = page.getByRole("tab", { name: /portable/i }).or(page.getByText(/Make Portable/i)).first();
    if (await makePortableTab.isVisible()) {
      await makePortableTab.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {}

  // Show live transfer tracker
  console.log("Scene 3: Inspecting Wormhole Transfer Tracker...");
  await page.goto("https://musd-reach.vercel.app/app?tab=transfers", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  // Show destination mint on BaseScan
  console.log("Scene 3: Showing BaseScan mint transaction...");
  try {
    await page.goto("https://sepolia.basescan.org/tx/0x77f19efa4666a4f0e1f2962ed62c4fbb3f398c16116351d10e83792053a81455", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7500);
  } catch (e) {
    console.log("BaseScan navigation:", e.message);
  }

  // ==========================================
  // SCENE 4: 0:51 - 1:12 (Transfer & Redeem)
  // ==========================================
  console.log("Scene 4: Showing BaseScan secondary transfer transaction...");
  try {
    await page.goto("https://sepolia.basescan.org/tx/0x52c1cdaa9ace5d1b73fdfd5d0b01f1035b52b019525d925c1b8bcb0fda2f7760", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5500);
  } catch (e) {}

  console.log("Scene 4: Navigating to Redeem tab...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  try {
    const redeemTab = page.getByRole("tab", { name: /redeem/i }).or(page.getByText(/Redeem/i)).first();
    if (await redeemTab.isVisible()) {
      await redeemTab.click();
      await page.waitForTimeout(3500);
    }
  } catch (e) {}

  // Show authenticated release on Mezo explorer
  console.log("Scene 4: Showing Mezo release transaction...");
  try {
    await page.goto("https://explorer.test.mezo.org/tx/0x3fadf55034dfe4a21d5015fa6cfeec92c426e96be401cb6c144677db47e86ae0", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(7000);
  } catch (e) {}

  // ==========================================
  // SCENE 5: 1:12 - 1:32 (Proof and Verification)
  // ==========================================
  console.log("Scene 5: Navigating to live Proof page...");
  await page.goto("https://musd-reach.vercel.app/proof", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  // Scroll down to show invariants & testnet runs
  await page.evaluate(() => window.scrollBy({ top: 380, behavior: "smooth" }));
  await page.waitForTimeout(4000);

  // Click on verified run
  try {
    const testnetRunRow = page.getByText(/testnet-2026-10-21/i).first();
    if (await testnetRunRow.isVisible()) {
      console.log("Scene 5: Opening testnet run verification details...");
      await testnetRunRow.click();
      await page.waitForTimeout(4000);
    }
  } catch (e) {}

  // View contract registry
  console.log("Scene 5: Navigating to Contract Registry...");
  await page.goto("https://musd-reach.vercel.app/contracts", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4500);

  // ==========================================
  // SCENE 6: 1:32 - 1:47 (Why It Matters)
  // ==========================================
  console.log("Scene 6: Navigating back to Application ecosystem view...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.scrollBy({ top: 200, behavior: "smooth" }));
  await page.waitForTimeout(8000);

  // ==========================================
  // SCENE 7: 1:47 - 1:57 (Closing)
  // ==========================================
  console.log("Scene 7: Closing on live site hero...");
  await page.goto("https://musd-reach.vercel.app/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);

  console.log("Finished browser workflow navigation. Closing context to save recording...");
  await page.close();
  await context.close();
  await browser.close();

  console.log("Browser recording complete!");
}

produceRecording().catch(console.error);
