/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The annotate sidebar's action state: the create toolbar's actions (Select,
 * Classification, detection mode) are mutually exclusive; canvas draws, overlay
 * clicks and click-to-quit move between them; clicking a label in the sidebar
 * activates the matching action; the edit form hides the create toolbar (but
 * keeps undo/redo and the mode toggle) and exiting it restores the label list;
 * the schema manager opens from the label list.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-toolbar-state");
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

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // one "cat" detection at (0.4-0.6, 0.4-0.6) and a "sunny" classification
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
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat", "dog"],
        attributes: [],
        component: "dropdown",
      },
      weather: {
        type: "classification",
        classes: ["sunny", "cloudy", "rainy"],
        attributes: [],
        component: "dropdown",
      },
    },
  });
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

const openAnnotate = async (modal: ModalPom) => {
  await modal.assert.isOpen();
  await modal.waitForSampleLoadDomAttribute();
  await modal.sidebar.switchMode("annotate");
};

/** The label list's header, which unmounts while the edit form is showing. */
const labelListHeader = (modal: ModalPom) =>
  modal.sidebar.locator.getByText("Edit", { exact: true });

/** Assert exactly one of the create toolbar's actions is active. */
const expectActive = async (
  modal: ModalPom,
  action: "select" | "classification" | "detection",
) => {
  const { assert } = modal.sidebar.annotate;
  await assert.selectIsActive(action === "select");
  await assert.classificationIsActive(action === "classification");
  await assert.detectionModeIsActive(action === "detection");
};

const clickCanvas = async (
  modal: ModalPom,
  x: number,
  y: number,
  cursor: "crosshair" | "pointer",
) => {
  await modal.sampleCanvas.move(x, y, cursor);
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.up();
};

test.describe.serial("annotate toolbar state", () => {
  test("Select is the default and the toolbar actions are mutually exclusive", async ({
    modal,
  }) => {
    await openAnnotate(modal);
    await expectActive(modal, "select");

    await modal.sidebar.annotate.createClassification();
    await expectActive(modal, "classification");

    // the create toolbar (incl. Select) is hidden while editing; exiting the
    // edit form returns to the default Select action
    await modal.sidebar.edit.exitToList();
    await expectActive(modal, "select");

    await modal.sidebar.annotate.detectionMode("Detections");
    await expectActive(modal, "detection");

    await modal.sidebar.annotate.createClassification();
    await expectActive(modal, "classification");

    await modal.sidebar.edit.exitToList();
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sidebar.annotate.selectAction();
    await expectActive(modal, "select");
  });

  test("detection mode draws under a crosshair, stays active after a draw, and click-to-quit returns to Select", async ({
    modal,
  }) => {
    await openAnnotate(modal);
    // canvas overlays are not hit-testable until lighter's first render
    await modal.waitForLighterReady();

    await modal.sidebar.annotate.detectionMode("Detections");
    await expectActive(modal, "detection");

    // overlays don't claim clicks while drawing — crosshair over them too
    await modal.sampleCanvas.move(0.09, 0.09, "crosshair");
    await modal.sampleCanvas.move(0.5, 0.5, "crosshair");

    await clickCanvas(modal, 0.09, 0.09, "crosshair");
    await expectActive(modal, "select");

    // draw away from the existing overlay; the new box opens its edit form
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.8, 0.8, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.assert.hasCursor("nwse-resize");
    await expectActive(modal, "detection");

    // quitting before the async establish flow commits would re-activate
    // detection mode, so wait for the edit form first
    await expect(labelListHeader(modal)).toBeHidden();
    await clickCanvas(modal, 0.09, 0.09, "crosshair");
    await expectActive(modal, "select");
  });

  test("overlay clicks enter the matching action; in detection mode they quit it", async ({
    modal,
  }) => {
    await openAnnotate(modal);
    await modal.waitForLighterReady();

    // in detection mode the existing detection doesn't claim the click:
    // click-to-quit applies over overlays like empty canvas
    await modal.sidebar.annotate.detectionMode("Detections");
    await clickCanvas(modal, 0.5, 0.5, "crosshair");
    await expectActive(modal, "select");
    await expect(labelListHeader(modal)).toBeVisible();

    // the classification tab renders at the top-left of the media bounds
    await clickCanvas(modal, 0.05, 0.02, "pointer");
    await expectActive(modal, "classification");

    await modal.sidebar.edit.exitToList();
    await expectActive(modal, "select");

    // clicking the detection opens its edit form and activates detection mode
    await clickCanvas(modal, 0.5, 0.5, "pointer");
    await expectActive(modal, "detection");
    await expect(labelListHeader(modal)).toBeHidden();

    await clickCanvas(modal, 0.09, 0.09, "crosshair");
    await expectActive(modal, "select");
  });

  test("clicking a label in the sidebar activates the matching action", async ({
    modal,
  }) => {
    await openAnnotate(modal);
    await expectActive(modal, "select");

    await modal.sidebar.annotate.selectActiveLabel("sunny", 0);
    await expectActive(modal, "classification");

    await modal.sidebar.edit.exitToList();
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await expectActive(modal, "detection");
  });

  test("the edit form hides the create toolbar, keeps undo/redo and the mode toggle, and exiting restores the label list", async ({
    modal,
    page,
  }) => {
    await openAnnotate(modal);

    const detectionModeButton = page.getByTestId("detection-mode");
    const exploreButton = modal.sidebar.locator.getByTestId("explore");
    const annotateButton = modal.sidebar.locator.getByTestId("annotate");
    await expect(detectionModeButton).toBeVisible();
    await expect(modal.sidebar.edit.undoButton).toBeVisible();
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();
    await expect(labelListHeader(modal)).toBeVisible();

    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await expect(detectionModeButton).toBeHidden();
    await expect(labelListHeader(modal)).toBeHidden();
    await expect(modal.sidebar.edit.undoButton).toBeVisible();
    await expect(exploreButton).toBeVisible();
    await expect(annotateButton).toBeVisible();

    await modal.sidebar.edit.exitToList();
    await expect(labelListHeader(modal)).toBeVisible();
    await expect(detectionModeButton).toBeVisible();
  });

  test("the schema manager opens from the label list", async ({
    modal,
    schemaManager,
  }) => {
    await openAnnotate(modal);

    await schemaManager.open();
    await schemaManager.assert.isOpen();

    await schemaManager.close();
    await schemaManager.assert.isClosed();
  });
});
