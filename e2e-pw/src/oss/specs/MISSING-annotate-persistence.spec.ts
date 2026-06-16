/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Drives the modal annotation flow end to end: draw a detection, then verify
 * one autosave request, that the edit is still present after navigating away
 * and back, and that it persisted to the database.
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
    // Count every /fields PATCH and its status. The contract is exactly one
    // consolidated flush for the single drawn box (duplicate flushes are a
    // regression), and a single writer must never see a non-200 (409 conflict).
    const fieldsPatchStatuses: number[] = [];
    page.on("response", (response) => {
      if (
        response.url().includes("/fields") &&
        response.request().method() === "PATCH"
      ) {
        fieldsPatchStatuses.push(response.status());
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
    // (Navigation runs in explore mode — the navigation POM reads the sample
    // id from the explore sidebar, which annotate mode replaces.)
    await modal.sidebar.switchMode("explore");
    await modal.navigateNextSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.navigatePreviousSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // The drawn detection must be back IN THE SCENE after navigation — proven
    // by an artifact tied to it, not by tool state. The re-seeded sidebar
    // label list has two "cat" entries (the seeded box + the drawn one);
    // selecting the second only succeeds if the drawn box survived the round
    // trip (it would throw on a missing nth(1) entry otherwise).
    await modal.sidebar.annotate.selectActiveLabel("cat", 1);

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

    // Exactly one consolidated flush, and it succeeded (no 409 for a single
    // writer, no duplicate flush).
    expect(
      fieldsPatchStatuses,
      `expected one successful /fields PATCH, got ${fieldsPatchStatuses}`
    ).toEqual([200]);
  });
});
