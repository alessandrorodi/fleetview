import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:4173/";
const out = process.argv[3] || "docs/screenshot.png";
const mode = process.argv[4] || "board"; // "board" | "bulk"

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1040, height: 860 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});
// Force demo mode so we never render real PRs.
await page.addInitScript(() => localStorage.setItem("fleetview.demo", "1"));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector(".row");
await page.waitForTimeout(500); // let fonts + reveal animation settle

if (mode === "bulk") {
  const boxes = await page.$$(".row input[type=checkbox]");
  for (const b of boxes.slice(0, 2)) await b.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
} else {
  const el = await page.$(".app");
  await el.screenshot({ path: out });
}
await browser.close();
console.log("saved", out, `(${mode})`);
