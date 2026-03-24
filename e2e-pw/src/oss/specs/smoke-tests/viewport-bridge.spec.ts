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
  test("visual round-trip: Looker screenshot is identical after toggling to Lighter and back", async ({
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

    // Wait for PixiJS to have fully initialised and applied the transferred
    // viewport before switching back.
    await modal.waitForLighterReady();

    await modal.sidebar.switchMode("explore");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.waitForSampleLoadDomAttribute();

    const after = await modal.sampleCanvas.screenshot(hideOverlays);

    // Use a Jimp-based comparison with a tiny per-pixel tolerance instead of
    // a strict byte-level comparison.
    const beforeImg = await Jimp.read(before);
    const afterImg = await Jimp.read(after);
    const diff = jimpDiff(beforeImg, afterImg, 0.02);
    expect(diff.percent).toBeLessThan(0.001);
  });

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
    const diff = jimpDiff(lookerImg, lighterImg, 0.15);

    // Less than 10% of pixels may differ; a completely wrong viewport would
    // push this near 1.0.
    expect(diff.percent).toBeLessThan(0.1);
  });
});
