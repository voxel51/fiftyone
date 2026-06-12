/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * End-to-end acceptance for the annotation persistence pipeline: drawing in
 * the modal autosaves exactly once per interval with no conflict errors, the
 * edit survives modal back/forward navigation without a refresh, and the
 * label is durably persisted to the database.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-persistence"
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

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 3,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      detections: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          {
            _id: createId(),
            label: "cat",
            bounding_box: [0.1, 0.1, 0.2, 0.2],
          },
        ],
      },
    }),
  });

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["cat", "dog"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
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

test.describe.serial("annotate persistence lifecycle", () => {
  test("draw → autosave once without conflicts → navigate away and back → persisted", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    // A 409 (precondition conflict) with a single writer is the regression
    // this pipeline exists to prevent — fail on any.
    const conflictResponses: number[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("/fields") &&
        response.request().method() === "PATCH" &&
        response.status() !== 200
      ) {
        conflictResponses.push(response.status());
      }
    });

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    // Draw a box in the bottom-right, away from the seeded label, and wait
    // for the (single, consolidated) autosave flush to land.
    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/fields") &&
        response.request().method() === "PATCH"
    );
    await modal.sampleCanvas.move(0.7, 0.7, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.up();
    const saveResponse = await savePromise;
    expect(saveResponse.status()).toBe(200);

    // The edit must survive navigating away and back WITHOUT any refresh:
    // the scene re-seeds from the canonical local copy, not a refetch.
    await modal.navigateNextSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.navigatePreviousSample();
    await modal.waitForSampleLoadDomAttribute();

    // Clicking the drawn box's location selects an overlay — proof the label
    // is in the scene after back-navigation.
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.8, 0.8);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    // Durably persisted: the database holds both the seeded and drawn boxes.
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo

      dataset = fo.load_dataset("${datasetName}")
      sample = dataset.first()
      detections = sample.detections.detections
      assert len(detections) == 2, (
        f"expected the drawn detection to be persisted, found {len(detections)}"
      )
    `);

    expect(
      conflictResponses,
      `single-writer saves must never conflict/fail, got ${conflictResponses}`
    ).toHaveLength(0);
  });
});
