import { Jimp, diff as jimpDiff } from "jimp";
import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("viewport-bridge-e2e");
const STABILIZATION_MS = 200;

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

/**
 * Drag the canvas center by a known pixel offset.
 * A rightward drag adds +N to panX; a downward drag adds +N to panY.
 */
async function panCanvas(
  modal: ModalPom,
  direction: "left" | "right" | "up" | "down",
  offsetPixels: number
) {
  const box = await modal.sampleCanvas.locator.boundingBox();
  if (!box) {
    throw new Error("Canvas bounding box not available");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  let endX = startX;
  let endY = startY;

  switch (direction) {
    case "left":
      endX -= offsetPixels;
      break;
    case "right":
      endX += offsetPixels;
      break;
    case "up":
      endY -= offsetPixels;
      break;
    case "down":
      endY += offsetPixels;
      break;
  }

  await modal.sampleCanvas.page.mouse.move(startX, startY);
  await modal.sampleCanvas.page.mouse.down();
  await modal.sampleCanvas.page.mouse.move(endX, endY, { steps: 10 });
  await modal.sampleCanvas.page.mouse.up();
}

/**
 * Zoom the canvas by scrolling the mouse wheel at the canvas center.
 *
 * A negative deltaY zooms in; a positive deltaY zooms out.
 */
async function zoomCanvas(modal: ModalPom, deltaY: number) {
  const box = await modal.sampleCanvas.locator.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await modal.sampleCanvas.page.mouse.move(cx, cy);
  await modal.sampleCanvas.page.mouse.wheel(0, deltaY);
}

/**
 * Capture a clean screenshot of the sample canvas.
 */
async function screenshotCanvas(modal: ModalPom): Promise<Buffer> {
  const page = modal.sampleCanvas.page;

  // Move cursor into canvas so Looker registers the Shift keydown
  const box = await modal.sampleCanvas.locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await page.keyboard.down("Shift");

  await page.waitForTimeout(STABILIZATION_MS);
  const buf = await modal.sampleCanvas.locator.screenshot();
  await page.keyboard.up("Shift");
  return buf;
}

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
  }) => {
    const PAN_X = 150;
    const ZOOM_IN = -600;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await zoomCanvas(modal, ZOOM_IN);
    await panCanvas(modal, "right", PAN_X);

    const before = await screenshotCanvas(modal);

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sidebar.switchMode("explore");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.waitForSampleLoadDomAttribute();

    const after = await screenshotCanvas(modal);

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
    const PAN_X = 150;
    const ZOOM_IN = -600;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await zoomCanvas(modal, ZOOM_IN);
    await panCanvas(modal, "right", PAN_X);

    const lookerBuf = await screenshotCanvas(modal);

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);

    const lighterBuf = await screenshotCanvas(modal);

    const lookerImg = await Jimp.read(lookerBuf);
    const lighterImg = await Jimp.read(lighterBuf);

    // Crop the renderer-specific toolbar strip from the bottom of each image
    // so that the Looker controls bar and the Lighter toolbar row are excluded
    // from the pixel comparison. Both toolbars occupy roughly the bottom 35px.
    const TOOLBAR_HEIGHT = 35;
    const cropWidth = lookerImg.width;
    const cropHeight = lookerImg.height - TOOLBAR_HEIGHT;
    const lookerCropped = lookerImg.clone().crop({
      x: 0,
      y: 0,
      w: cropWidth,
      h: cropHeight,
    });
    const lighterCropped = lighterImg.clone().crop({
      x: 0,
      y: 0,
      w: cropWidth,
      h: cropHeight,
    });

    // Allow per-pixel color distance up to 15% of the maximum (255) to account
    // for the difference in rendering pipelines (Canvas 2D vs WebGL/Pixi.js).
    const diff = jimpDiff(lookerCropped, lighterCropped, 0.15);


    // Less than 10% of pixels may differ; a completely wrong viewport would
    // push this near 1.0.
    expect(diff.percent).toBeLessThan(0.1);
  });
});
