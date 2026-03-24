/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Modal sample canvas rendering regressions
 */

import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  datasetName: string;
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },

  datasetName: async ({ datasetFactory }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix(
      `image-rendering-is-pixelated`
    );
    await datasetFactory.createBlankDataset({
      datasetName,
      numbered: true, // Numbering ensures we capture the rendering details
    });

    await use(datasetName);
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.describe.serial("Pixelated Image Rendering", () => {
  /**
   * Verifies that the `image-rendering: pixelated` CSS property is applied
   * correctly in both canvas modes:
   *
   * 1. **Explore mode (Looker canvas)** — the default view when opening a
   *    sample. Asserts the canvas type is `LOOKER` and compares a screenshot
   *    against the `pixelated.png` baseline.
   *
   * 2. **Annotate mode (Lighter canvas)** — activated by switching the sidebar
   *    mode to "annotate". Compares a screenshot against the
   *    `pixelated.png` baseline.
   */
  test("Explore and Annotate canvases have pixelated image rendering", async ({
    datasetName,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // Navigate to the grid and open the sample modal for the target sample ID
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    // Confirm the modal opened and is displaying the Looker (Explore) canvas
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);

    // Assert pixelated rendering in Explore mode via screenshot comparison
    await modal.sampleCanvas.assert.hasScreenshot("pixelated.png");

    // Switch to Annotate mode and assert pixelated rendering there as well
    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.hasScreenshot("pixelated.png");
  });
});
