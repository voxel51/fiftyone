/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that canvas interactions (drawing, clicking overlays, click-to-quit)
 * correctly activate and deactivate the action buttons.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-canvas-actions"
);
const id = "000000000000000000000000";

const test = base.extend<{
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      detections: "Detections",
      weather: "Classification",
    },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          {
            _id: createId(),
            label: "cat",
            bounding_box: [0.4, 0.4, 0.2, 0.2],
          },
        ],
      },
      weather: { _id: createId(), label: "sunny" },
    }),
  });

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["cat", "dog"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");

  await annotateSDK.updateLabelSchema(datasetName, "weather", {
    type: "classification",
    classes: ["sunny", "cloudy", "rainy"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "weather");
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("canvas interactions and action state", () => {
  test("drawing a detection keeps detection mode active and deactivates Select", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate detection mode
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Draw a detection in the bottom-right (away from existing overlays)
    await modal.sampleCanvas.move(0.8, 0.8, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.up();

    // detection mode should remain active, Select should remain inactive
    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
  });

  test("click-to-quit on empty space reactivates Select", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate detection mode
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Click empty space to quit
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // detection mode should deactivate, Select should reactivate
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive();
  });

  test("clicking an existing detection overlay in detection mode selects it", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate detection mode
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    // Click on the existing detection at (0.4-0.6, 0.4-0.6)
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // detection mode should remain active (it's a detection being edited)
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    // The label list should be hidden (edit form is showing)
    const labelListHeader = modal.sidebar.locator.getByText(
      "Click labels to edit"
    );
    await expect(labelListHeader).toBeHidden();
  });

  test("clicking an existing detection overlay activates detection mode", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Click on the existing detection at (0.4-0.6, 0.4-0.6)
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // detection mode should be active
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    // The label list should be hidden (edit form is showing)
    const labelListHeader = modal.sidebar.locator.getByText(
      "Click labels to edit"
    );
    await expect(labelListHeader).toBeHidden();
  });

  test("clicking a classification in sidebar activates Classification action", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Click the "sunny" classification label in the sidebar
    await modal.sidebar.annotate.selectActiveLabel("sunny", 0);

    // Classification action should be active, Select should be inactive
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);
  });

  test("clicking a detection in sidebar activates detection mode", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Click a detection label in the sidebar
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    // detection mode should auto-activate (isEditingDetection triggers it)
    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("clicking a classification overlay on canvas activates Classification", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Classification tab renders at the top-left of the media bounds.
    // Move to the top-left area and click.
    await modal.sampleCanvas.move(0.05, 0.02);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // Classification action should be active
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);
  });

  test("full cycle: canvas interactions switch between all actions", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // 1. Start in Select mode
    await modal.sidebar.annotate.assert.selectIsActive();

    // 2. Click the classification overlay → Classification active
    await modal.sampleCanvas.move(0.05, 0.02);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);

    // 3. Click Select to return to default
    await modal.sidebar.annotate.selectAction();
    await modal.sidebar.annotate.assert.selectIsActive();

    // 4. Click a detection overlay on canvas → detection mode active
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);

    // 5. Click-to-quit on empty space → back to Select
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("draw detection then click-to-quit reactivates Select", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate detection mode and draw a detection
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.8, 0.8, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.up();

    await modal.sidebar.annotate.assert.detectionModeIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Click-to-quit on empty space
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // Should return to Select
    await modal.sidebar.annotate.assert.detectionModeIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive();
  });
});
