import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:4173/";
const out = process.argv[3] || "docs/screenshot.png";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1040, height: 820 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
// Force demo mode so we never render real PRs.
await page.addInitScript(() => localStorage.setItem("fleetview.demo", "1"));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".row");
await page.waitForTimeout(500); // let fonts + reveal animation settle
const el = await page.$(".app");
await el.screenshot({ path: out });
await browser.close();
console.log("saved", out);
