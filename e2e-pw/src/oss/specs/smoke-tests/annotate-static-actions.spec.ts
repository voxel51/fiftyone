/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Tests that the Actions toolbar remains visible during annotation editing,
 * that the schema manager opens from the label list, and that exiting
 * QuickDraw closes the edit form.
 */
import { ground_truth_schema } from "src/oss/assets/annotate-schemas";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-static-actions"
);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
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
  `);

  await annotateSDK.updateLabelSchema(
    datasetName,
    "ground_truth",
    ground_truth_schema
  );
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "ground_truth");
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

test.describe.serial("static actions toolbar", () => {
  test("actions toolbar remains visible while editing a label", async ({
    grid,
    modal,
    page,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Verify actions toolbar is visible before editing
    const sidebar = modal.sidebar.locator;
    const undoButton = sidebar.getByTestId("undo-button");
    const quickDrawButton = page.getByTestId("quick-draw-detection");
    await expect(undoButton).toBeVisible();
    await expect(quickDrawButton).toBeVisible();

    // Click a label to enter edit mode
    await modal.sidebar.annotate.selectActiveLabel("bird", 1);

    // Actions toolbar should still be visible
    await expect(undoButton).toBeVisible();
    await expect(quickDrawButton).toBeVisible();
  });

  test("mode toggle remains visible while editing a label", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    // Verify mode toggle is visible before editing
    const exploreButton = modal.sidebar.locator.getByTestId("explore");
    const annotateButton = modal.sidebar.locator.getByTestId("annotate");
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();

    // Click a label to enter edit mode
    await modal.sidebar.annotate.selectActiveLabel("bird", 1);

    // Mode toggle should still be visible
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();
  });

  test("schema manager opens from label list", async ({
    grid,
    modal,
    schemaManager,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });

  test("exiting QuickDraw via toggle closes the edit form", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");

    const labelListHeader = modal.sidebar.locator.getByText(
      "Click labels to edit"
    );

    // Label list is visible before editing
    await expect(labelListHeader).toBeVisible();

    // Activate QuickDraw and draw a detection to open the edit form
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive();

    await modal.sampleCanvas.move(0.1, 0.1, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.2, 0.2);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nwse-resize");

    // Edit form is showing — label list is hidden during editing
    await expect(labelListHeader).toBeHidden();

    // Exit QuickDraw via the toggle button
    await modal.sidebar.annotate.quickDraw("Detections");
    await modal.sidebar.annotate.assert.quickDrawIsActive(false);

    // Edit form should be closed — label list should reappear
    await expect(labelListHeader).toBeVisible();
  });
});
