import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

async function testPlaywright() {
  mkdirSync("./rec_test", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: "./rec_test",
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  console.log("Navigating to https://musd-reach.vercel.app/...");
  await page.goto("https://musd-reach.vercel.app/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("Navigating to https://musd-reach.vercel.app/app...");
  await page.goto("https://musd-reach.vercel.app/app", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("Navigating to https://musd-reach.vercel.app/proof...");
  await page.goto("https://musd-reach.vercel.app/proof", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  await page.close();
  await context.close();
  await browser.close();
  console.log("Test recording successful!");
}

testPlaywright().catch(console.error);
