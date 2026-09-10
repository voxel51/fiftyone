/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that the create toolbar is hidden while editing a label (the edit form
 * carries its own undo/redo), that the mode toggle stays visible, that the
 * schema manager opens, and that exiting the edit form restores the label list.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-static-actions",
);
const id = "000000000000000000000000";

const test = base.extend<{
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    schema: {
      detections: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          {
            _id: createId(),
            label: "bird",
            bounding_box: [0.3, 0.3, 0.2, 0.2],
          },
          {
            _id: createId(),
            label: "bird",
            bounding_box: [0.6, 0.6, 0.2, 0.2],
          },
        ],
      },
    }),
  });

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["bird", "cat"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
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

test.describe.serial("static actions toolbar", () => {
  test("create toolbar is hidden while editing a label", async ({
    modal,
    page,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // The create toolbar is visible before editing
    const detectionModeButton = page.getByTestId("detection-mode");
    await expect(detectionModeButton).toBeVisible();
    await expect(modal.sidebar.edit.undoButton).toBeVisible();

    // Click a label to enter edit mode
    await modal.sidebar.annotate.selectActiveLabel("bird", 0);

    // The create toolbar is hidden while editing; the edit form keeps its own
    // undo/redo
    await expect(detectionModeButton).toBeHidden();
    await expect(modal.sidebar.edit.undoButton).toBeVisible();
  });

  test("mode toggle remains visible while editing a label", async ({
    modal,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Verify mode toggle is visible before editing
    const exploreButton = modal.sidebar.locator.getByTestId("explore");
    const annotateButton = modal.sidebar.locator.getByTestId("annotate");
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();

    // Click a label to enter edit mode
    await modal.sidebar.annotate.selectActiveLabel("bird", 0);

    // Mode toggle should still be visible
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();
  });

  test("schema manager opens from label list", async ({
    modal,
    schemaManager,
  }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("exiting the edit form restores the label list", async ({ modal }) => {
    await modal.assert.isOpen();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    const labelListHeader = modal.sidebar.locator.getByText("Edit", {
      exact: true,
    });

    // Label list is visible before editing
    await expect(labelListHeader).toBeVisible();

    // Activate detection mode and draw a detection to open the edit form
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.assert.detectionModeIsActive();

    await modal.sampleCanvas.move(0.1, 0.1, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.2, 0.2);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nwse-resize");

    // Edit form is showing — the label list (and create toolbar) are hidden
    await expect(labelListHeader).toBeHidden();

    // Exit the edit form via the back button — the label list reappears
    await modal.sidebar.edit.exitToList();
    await expect(labelListHeader).toBeVisible();
  });
});
