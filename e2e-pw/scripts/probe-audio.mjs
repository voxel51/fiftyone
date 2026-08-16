/**
 * Ad-hoc MCAP audio probe. Opens a sample in a real browser, presses play,
 * and dumps the `window.__foAudio` stage trace plus which audio controls
 * rendered. The audio path mounts OUTSIDE `WebGpuViewStage`, so this works
 * headlessly even where WebGPU is unavailable and the mosaic can't paint.
 *
 * Usage: node scripts/probe-audio.mjs <dataset> <sampleId> [devServerUrl]
 */
import { chromium } from "playwright-core";

const [dataset, sampleId, base = "http://localhost:5173"] = process.argv.slice(2);
if (!dataset || !sampleId) {
  console.error("usage: node scripts/probe-audio.mjs <dataset> <sampleId> [url]");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(`${base}/datasets/${dataset}?id=${sampleId}`, {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});

for (let i = 0; i < 40; i++) {
  if (await page.evaluate(() => (window.__foAudio ?? []).length > 0)) break;
  await page.waitForTimeout(1000);
}

const play = await page.$('[data-testid="timeline-controls-play-pause"]');
if (play) {
  await play.click();
  await page.waitForTimeout(3000);
}

console.log(
  JSON.stringify(
    await page.evaluate(() => ({
      trace: window.__foAudio ?? null,
      controls: {
        play: Boolean(document.querySelector('[data-testid="timeline-controls-play-pause"]')),
        volume: Boolean(document.querySelector('[data-testid="timeline-controls-volume"]')),
        mixer: Boolean(document.querySelector('[data-testid="timeline-controls-mixed"]')),
        trailing: Boolean(document.querySelector('[data-testid="timeline-controls-trailing-actions"]')),
        audioTile: document.querySelector('[data-testid="audio-tile-status"]')?.textContent ?? null,
      },
    })),
    null,
    1,
  ),
);

await browser.close();
