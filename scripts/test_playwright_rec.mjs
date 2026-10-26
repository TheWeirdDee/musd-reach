import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";

async function testRecord() {
  mkdirSync("./test_rec", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: "./test_rec",
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  console.log("Navigating to https://musd-reach.vercel.app/...");
  await page.goto("https://musd-reach.vercel.app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log("Navigating to https://musd-reach.vercel.app/app...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log("Navigating to https://musd-reach.vercel.app/proof...");
  await page.goto("https://musd-reach.vercel.app/proof", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  await page.close();
  await context.close();
  await browser.close();
  console.log("Recording complete!");
}

testRecord().catch(console.error);
