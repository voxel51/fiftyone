import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const DATASET_NAME = getUniqueDatasetNameWithPrefix("viewport-bridge-e2e");

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

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createBlankDataset({
    datasetName: DATASET_NAME,
    numSamples: 1,
    numbered: true,
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, DATASET_NAME);
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
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.wheel(7);

    // Pan right by dragging from the canvas centre 150px to the right.
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.movePixels(150, 0);
    await modal.sampleCanvas.up();

    await modal.sampleCanvas.assert.hasScreenshot("round-trip-looker.png");

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);

    // Wait for PixiJS to have fully initialised and applied the transferred
    // viewport before switching back.
    await modal.waitForLighterReady();

    await modal.sidebar.switchMode("explore");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.waitForSampleLoadDomAttribute();

    await modal.sampleCanvas.assert.hasScreenshot("round-trip-looker.png");
  });

  test("visual cross-renderer: Lighter shows same image region as Looker after viewport transfer", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.wheel(7);

    // Pan right by dragging from the canvas centre 150px to the right.
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.movePixels(150, 0);
    await modal.sampleCanvas.up();

    await modal.sampleCanvas.assert.hasScreenshot("cross-renderer.png");

    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);

    await modal.sampleCanvas.assert.hasScreenshot("cross-renderer.png");
  });
});
