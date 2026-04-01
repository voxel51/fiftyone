/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that annotation action buttons (Select, Classification, Detection)
 * are mutually exclusive — activating one deactivates the others.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-action-switching"
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
  await datasetFactory.createBlankDataset({
    datasetName,
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

test.describe.serial("action switching", () => {
  test("Select is active by default", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("activating Classification deactivates Select", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    await modal.sidebar.annotate.createClassification();

    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("activating QuickDraw deactivates Select", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.assert.selectIsActive();

    await modal.sidebar.annotate.quickDraw("Detections");

    await modal.sidebar.annotate.assert.quickDrawIsActive();
    await modal.sidebar.annotate.assert.selectIsActive(false);
    await modal.sidebar.annotate.assert.classificationIsActive(false);
  });

  test("switching from Classification to QuickDraw deactivates Classification", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
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
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    await modal.sidebar.annotate.createClassification();

    await modal.sidebar.annotate.assert.classificationIsActive();
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
    await modal.sidebar.annotate.assert.selectIsActive(false);
  });

  test("Select button deactivates Classification", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.createClassification();
    await modal.sidebar.annotate.assert.classificationIsActive();

    await modal.sidebar.annotate.selectAction();

    await modal.sidebar.annotate.assert.selectIsActive();
    await modal.sidebar.annotate.assert.classificationIsActive(false);
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);
  });

  test("Select button deactivates QuickDraw", async ({ modal }) => {
    await modal.assert.isOpen();
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
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    // Move to empty space — should show crosshair
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");

    // Move over an existing detection — should show pointer
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
  });
});
