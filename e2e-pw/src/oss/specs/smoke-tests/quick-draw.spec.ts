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

test.describe.serial("QuickDraw", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, DATASET_NAME, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
    await modal.sidebar.switchMode("annotate");
  });

  test("toggle button deactivates QuickDraw", async ({ modal }) => {
    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // hover over the canvas
    await modal.sampleCanvas.assert.hasCursor("pointer");
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.assert.hasCursor("crosshair");

    // Deactivate by clicking the button again
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sampleCanvas.assert.hasCursor("pointer");
  });

  test("draw and click-to-quit", async ({ modal }) => {
    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Draw a detection
    await modal.sampleCanvas.move(0.4, 0.4, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.6, 0.6);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nwse-resize");
    await modal.sampleCanvas.assert.hasScreenshot(
      "draw-and-quit-detection-selected.png"
    );

    // Click-to-quit off the detection
    await modal.sampleCanvas.move(0.1, 0.1);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sampleCanvas.assert.hasCursor("default");
    await modal.sampleCanvas.assert.hasScreenshot(
      "draw-and-quit-exited-quickdraw.png"
    );
  });

  test("draw multiple detections", async ({ modal }) => {
    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Draw detection #1 (top-left quadrant)
    await modal.sampleCanvas.move(0.2, 0.2, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.4, 0.4);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nwse-resize");

    // Draw detection #2 (bottom-right quadrant)
    await modal.sampleCanvas.move(0.6, 0.8, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.8, 0.6);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nesw-resize");
    await modal.sampleCanvas.assert.hasScreenshot(
      "multiple-detections-second-selected.png"
    );

    // Click-to-quit off both detections
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sampleCanvas.assert.hasCursor("default");
    await modal.sampleCanvas.assert.hasScreenshot(
      "multiple-detections-exited-quickdraw.png"
    );
  });
});
