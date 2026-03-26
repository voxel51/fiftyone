/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that annotation action buttons (Select, Classification, Detection)
 * are mutually exclusive — activating one deactivates the others.
 */
import { ground_truth_schema } from "src/oss/assets/annotate-schemas";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-action-switching"
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

    # Add a Classification field so the Classification action button is enabled
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

test.describe.serial("action switching", () => {
  test("Select is active by default", async ({ grid, modal }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("activating Classification deactivates Select", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    await modal.sidebar.annotate.createClassification();

    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("activating QuickDraw deactivates Select", async ({ grid, modal }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    await modal.sidebar.annotate.quickDraw("Detections");

    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("switching from Classification to QuickDraw deactivates Classification", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.createClassification();
    await modal.sidebar.annotate.assert.classificationIsActive();

    await modal.sidebar.annotate.quickDraw("Detections");

    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive(false);
  });

  test("switching from QuickDraw to Classification deactivates QuickDraw", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    await modal.sidebar.annotate.createClassification();

    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive(false);
  });

  test("Select button deactivates Classification", async ({ grid, modal }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.createClassification();
    await modal.sidebar.annotate.assert.classificationIsActive();

    await modal.sidebar.annotate.selectAction();

    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("Select button deactivates QuickDraw", async ({ grid, modal }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    await modal.sidebar.annotate.selectAction();

    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("clicking overlay in QuickDraw shows pointer cursor", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Move to empty space — should show crosshair
    await modal.sampleCanvas.move(0.95, 0.95, "crosshair");

    // Move over an existing detection — should show pointer
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
  });
});
