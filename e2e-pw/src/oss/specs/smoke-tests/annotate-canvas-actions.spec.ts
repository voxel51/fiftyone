/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that canvas interactions (drawing, clicking overlays, click-to-quit)
 * correctly activate and deactivate the action buttons.
 */
import { ground_truth_schema } from "src/oss/assets/annotate-schemas";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-canvas-actions"
);

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

test.beforeAll(async ({ annotateSDK, foWebServer, fiftyoneLoader }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset_name = "${datasetName}"
    dataset = foz.load_zoo_dataset(
      "quickstart", max_samples=5, dataset_name=dataset_name
    )
    dataset.persistent = True

    # Add a Classification field
    dataset.add_sample_field("weather", fo.EmbeddedDocumentField, embedded_doc_type=fo.Classification)
    for sample in dataset:
      sample["weather"] = fo.Classification(label="sunny")
      sample.save()
  `);

  await annotateSDK.updateLabelSchema(
    datasetName,
    "ground_truth",
    ground_truth_schema
  );
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "ground_truth");

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
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("canvas interactions and action state", () => {
  test("drawing a detection keeps QuickDraw active and deactivates Select", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Draw a detection
    await modal.sampleCanvas.move(0.1, 0.1, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.2, 0.2);
    await modal.sampleCanvas.up();

    // QuickDraw should remain active, Select should remain inactive
    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
  });

  test("click-to-quit on empty space reactivates Select", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Click empty space to quit
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // QuickDraw should deactivate, Select should reactivate
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive();
  });

  test("clicking an existing detection overlay in QuickDraw selects it", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate QuickDraw
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Click on an existing detection (quickstart has detections in the center)
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // QuickDraw should remain active (it's a detection being edited)
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // The label list should be hidden (edit form is showing)
    const labelListHeader = modal.sidebar.locator.getByText(
      "Click labels to edit"
    );
    await expect(labelListHeader).toBeHidden();
  });

  test("clicking an existing detection overlay activates QuickDraw", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Click on an existing detection (quickstart has detections in the center)
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // QuickDraw be active
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // The label list should be hidden (edit form is showing)
    const labelListHeader = modal.sidebar.locator.getByText(
      "Click labels to edit"
    );
    await expect(labelListHeader).toBeHidden();
  });

  test("clicking a classification in sidebar activates Classification action", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Click the "sunny" classification label in the sidebar
    await modal.sidebar.annotate.selectActiveLabel("sunny", 0);

    // Classification action should be active, Select should be inactive
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("clicking a detection in sidebar activates QuickDraw", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Click a detection label in the sidebar
    await modal.sidebar.annotate.selectActiveLabel("bird", 1);

    // QuickDraw should auto-activate (isEditingDetection triggers it)
    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("clicking a classification overlay on canvas activates Classification", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    // Click on the classification overlay (upper-left corner tab)
    // Classifications render as tabs anchored to the top-left of the canvas
    await modal.sampleCanvas.move(0.05, 0.02, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // Classification action should be active
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("full cycle: canvas interactions switch between all actions", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // 1. Start in Select mode
    await modal.sidebar.annotate.assert.selectIsActive();

    // 2. Click a classification overlay → Classification active
    await modal.sampleCanvas.move(0.05, 0.02, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);

    // 3. Click Select to return to default
    await modal.sidebar.annotate.selectAction();
    await modal.sidebar.annotate.assert.selectIsActive();

    // 4. Click a detection overlay → QuickDraw active
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);

    // 5. Click-to-quit on empty space → back to Select
    await modal.sampleCanvas.move(0.01, 0.01, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("draw detection then click-to-quit reactivates Select", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Activate QuickDraw and draw a detection
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sampleCanvas.move(0.1, 0.1, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.2, 0.2);
    await modal.sampleCanvas.up();

    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);

    // Click-to-quit on empty space (top-left corner)
    await modal.sampleCanvas.move(0.01, 0.01, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();

    // Should return to Select
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive();
  });
});
