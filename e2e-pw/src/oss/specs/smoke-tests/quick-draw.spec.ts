/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const DATASET_NAME = getUniqueDatasetNameWithPrefix("quick-draw");

const test = base.extend<{
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createBlankDataset({
    datasetName: DATASET_NAME,
    schema: {
      detections: "Detections",
    },
  });
  await annotateSDK.updateLabelSchema(DATASET_NAME, "detections", {
    type: "detections",
    classes: [],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(DATASET_NAME, "detections");
});

test.describe.serial("quick draw", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, DATASET_NAME, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.sidebar.switchMode("annotate");
  });

  test("detection", async ({ modal }) => {
    // Activate quick draw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Draw a big detection
    await modal.sampleCanvas.move(0.4, 0.4, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.6, 0.6);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("crosshair");
    await modal.sampleCanvas.assert.hasScreenshot(
      "centered-detection-selected.png"
    );

    // Move the detection
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.51, 0.51);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("grab");
    await modal.sampleCanvas.assert.hasScreenshot(
      "centered-detection-moved.png"
    );

    // Deselect the Detection
    await modal.sampleCanvas.click(0.8, 0.8);
    await modal.sampleCanvas.assert.hasScreenshot("centered-detection.png");
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });
});
