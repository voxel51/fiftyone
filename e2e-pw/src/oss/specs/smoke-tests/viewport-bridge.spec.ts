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
  }) => {
    const hideOverlays = true;
    const PAN_X = 150;
    const ZOOM_IN = -600;

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await modal.sampleCanvas.zoom(ZOOM_IN);
    await modal.sampleCanvas.pan("right", PAN_X);

    const before = await modal.sampleCanvas.screenshot(hideOverlays);

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sidebar.switchMode("explore");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.waitForSampleLoadDomAttribute();

    const after = await modal.sampleCanvas.screenshot(hideOverlays);

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
