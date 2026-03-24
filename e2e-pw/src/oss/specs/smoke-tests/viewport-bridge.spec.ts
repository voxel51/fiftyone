import { Jimp, diff as jimpDiff } from "jimp";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("viewport-bridge-e2e");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset_name = "${datasetName}"
    dataset = foz.load_zoo_dataset(
      "quickstart", max_samples=5, dataset_name=dataset_name
    )
    dataset.persistent = True
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("viewport-bridge-visual", () => {
  /**
   * Looker -> Lighter -> Looker round-trip, same renderer screenshot comparison.
   *
   * After panning and zooming Looker, we toggle through Lighter and back.
   * Since Looker is the same renderer both times, the screenshot must be
   * pixel-for-pixel identical — this proves the atom bridge preserves the
   * full viewport state with zero loss.
   */
  test("visual round-trip: Looker screenshot is identical before and after Looker→Lighter→Looker", async ({
    grid,
    modal,
    page,
  }) => {
    // Capture browser-side [viewport-bridge] logs and surface them in CI output.
    const browserLogs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[viewport-bridge]")) {
        browserLogs.push(`[browser ${msg.type()}] ${text}`);
      }
    });

    const hideOverlays = true;
    const PAN_X = 150;
    const ZOOM_IN = -600;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await modal.sampleCanvas.zoom(ZOOM_IN);
    await modal.sampleCanvas.pan("right", PAN_X);

    // Give the viewport state time to settle before the baseline screenshot.
    const before = await modal.sampleCanvas.screenshot(hideOverlays);

    // Snapshot the Looker viewport state from the DOM before switching.
    const lookerViewportBefore = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "[data-cy=modal-looker-container] canvas"
      );
      return {
        canvasLoaded: canvas?.getAttribute("canvas-loaded"),
        width: canvas?.width,
        height: canvas?.height,
      };
    });
    console.log("[diag] Looker canvas state before switch:", lookerViewportBefore);

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);

    // Wait for PixiJS to have fully initialised and applied the transferred
    // viewport before switching back.
    await modal.waitForLighterReady();

    // Snapshot the Lighter canvas state.
    const lighterCanvasState = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "[data-cy=lighter-sample-renderer] canvas"
      );
      return {
        lighterReady: canvas?.getAttribute("lighter-ready"),
        id: canvas?.id,
        width: canvas?.width,
        height: canvas?.height,
      };
    });
    console.log("[diag] Lighter canvas state after waitForLighterReady:", lighterCanvasState);

    await modal.sidebar.switchMode("explore");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.waitForSampleLoadDomAttribute();

    // Snapshot the Looker canvas state after restoration.
    const lookerViewportAfter = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        "[data-cy=modal-looker-container] canvas"
      );
      return {
        canvasLoaded: canvas?.getAttribute("canvas-loaded"),
        width: canvas?.width,
        height: canvas?.height,
      };
    });
    console.log("[diag] Looker canvas state after round-trip:", lookerViewportAfter);

    const after = await modal.sampleCanvas.screenshot(hideOverlays);

    // Print all captured browser-side logs.
    if (browserLogs.length > 0) {
      console.log("[diag] Browser viewport-bridge logs:\n" + browserLogs.join("\n"));
    }

    console.log("[diag] before buffer length:", before.length, "| after buffer length:", after.length);
    console.log("[diag] buffers identical:", Buffer.compare(before, after) === 0);

    // If the buffers differ, log the first differing pixel coordinates and
    // RGBA values so CI output pinpoints exactly what changed.
    if (Buffer.compare(before, after) !== 0) {
      const beforeImg = await Jimp.read(before);
      const afterImg = await Jimp.read(after);
      const diffs: string[] = [];
      outer: for (let y = 0; y < beforeImg.height; y++) {
        for (let x = 0; x < beforeImg.width; x++) {
          const bPx = beforeImg.getPixelColor(x, y);
          const aPx = afterImg.getPixelColor(x, y);
          if (bPx !== aPx) {
            diffs.push(
              `(${x},${y}): before=0x${bPx.toString(16).padStart(8, "0")} after=0x${aPx.toString(16).padStart(8, "0")}`
            );
            if (diffs.length >= 20) break outer;
          }
        }
      }
      console.log(
        `[diag] First ${diffs.length} differing pixel(s):\n` +
          diffs.join("\n")
      );
    }

    // Same renderer, overlays hidden — must be pixel-perfect.
    expect(Buffer.compare(before, after)).toBe(0);
  });

  /**
   * Cross-renderer visual comparison: Looker vs Lighter showing the same region.
   *
   * After panning and zooming in Looker, we switch to Lighter and compare the
   * two screenshots with Jimp. The two renderers (Canvas 2D vs WebGL/Pixi.js)
   * produce slightly different pixels, so we allow up to 10% per-pixel
   * deviation. If the viewport were NOT restored the image region would be
   * completely different and the diff would approach 1.0.
   */
  test("visual cross-renderer: Lighter shows same image region as Looker after viewport transfer", async ({
    grid,
    modal,
  }) => {
    const hideOverlays = true;
    const PAN_X = 150;
    const ZOOM_IN = -600;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await modal.sampleCanvas.zoom(ZOOM_IN);
    await modal.sampleCanvas.pan("right", PAN_X);

    const lookerBuf = await modal.sampleCanvas.screenshot(hideOverlays);

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);

    const lighterBuf = await modal.sampleCanvas.screenshot(hideOverlays);

    const lookerImg = await Jimp.read(lookerBuf);
    const lighterImg = await Jimp.read(lighterBuf);

    // Allow per-pixel color distance up to 15% of the maximum (255) to account
    // for the difference in rendering pipelines (Canvas 2D vs WebGL/Pixi.js).
    // Screenshots now capture only the inner <canvas> element, so toolbar
    // strips are already excluded.
    const diff = jimpDiff(lookerImg, lighterImg, 0.15);


    // Less than 10% of pixels may differ; a completely wrong viewport would
    // push this near 1.0.
    expect(diff.percent).toBeLessThan(0.1);
  });
});
