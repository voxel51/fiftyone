/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { Box, SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

/** Unique dataset name scoped to this test file, prefixed with `"quick-edit"`. */
const DATASET_NAME = getUniqueDatasetNameWithPrefix("quick-edit");

/** The fixed ObjectId used to address the single sample in the dataset. */
const ID = "000000000000000000000000";

/** Width of the generated sample image in pixels. */
const IMAGE_WIDTH = 914;

/** Height of the generated sample image in pixels. */
const IMAGE_HEIGHT = 620;

/**
 * The initial bounding box for the detection label, expressed in relative
 * (0–1) coordinates. Centered in the image with 50% width and height.
 */
const INITIAL_BOUNDING_BOX = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

/**
 * Derived from {@link INITIAL_BOUNDING_BOX}, this array describes all eight
 * interactive handle points on a detection bounding box (four corners and four
 * edge midpoints).
 *
 * Each entry contains:
 * - `name`   — A human-readable label used in screenshot filenames.
 * - `cursor` — The CSS cursor prefix expected when hovering the handle.
 * - `x / y`  — The canvas-relative position (0–1) of the handle.
 * - `resize` — The expected bounding box after dragging the handle to (0.5, 0.5).
 * - `move`   — The expected bounding box after dragging the box center to this handle's position.
 */
const DETECTION_CORNERS_AND_EDGES = (({ x, y, width, height }: Box) => {
  return [
    {
      name: "top-left",
      cursor: "nwse",
      x,
      y,
      resize: { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
      move: { x: 0, y: 0, height, width },
    },
    {
      name: "top",
      cursor: "ns",
      x: x + width / 2,
      y,
      resize: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
      move: { x: 0.25, y: 0, height, width },
    },
    {
      name: "top-right",
      cursor: "nesw",
      x: x + width,
      y,
      resize: { x: 0.25, y: 0.5, width: 0.25, height: 0.25 },
      move: { x: 0.5, y: 0, height, width },
    },
    {
      name: "right",
      cursor: "ew",
      x: x + width,
      y: y + height / 2,
      resize: { x: 0.25, y: 0.25, width: 0.25, height: 0.5 },
      move: { x: 0.5, y: 0.25, height, width },
    },
    {
      name: "bottom-right",
      cursor: "nwse",
      x: x + width,
      y: y + height,
      resize: { x: 0.25, y: 0.25, width: 0.25, height: 0.25 },
      move: { x: 0.5, y: 0.5, height, width },
    },
    {
      name: "bottom",
      cursor: "ns",
      x: x + width / 2,
      y: y + height,
      resize: { x: 0.25, y: 0.25, width: 0.5, height: 0.25 },
      move: { x: 0.25, y: 0.5, height, width },
    },
    {
      name: "bottom-left",
      cursor: "nesw",
      x,
      y: y + height,
      resize: { x: 0.5, y: 0.25, width: 0.25, height: 0.25 },
      move: { x: 0, y: 0.5, height, width },
    },
    {
      name: "left",
      cursor: "ew",
      x,
      y: y + height / 2,
      resize: { x: 0.5, y: 0.25, width: 0.25, height: 0.5 },
      move: { x: 0, y: 0.25, height, width },
    },
  ];
})(INITIAL_BOUNDING_BOX);

const test = base.extend<{
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/** Stops the FiftyOne web server after all tests in this file have run. */
test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/**
 * Starts the FiftyOne web server and creates a single-sample dataset
 * with a `Classification` and a `Detections` field before any tests run.
 * The detection is initialized to {@link INITIAL_BOUNDING_BOX}.
 */
test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName: DATASET_NAME,
    imageOptions: {
      fillColor: "white",
      height: IMAGE_HEIGHT,
      width: IMAGE_WIDTH,
    },
    schema: {
      classification: "Classification",
      detections: "Detections",
    },
    withSampleData: (_, { createId }) => ({
      classification: { _id: createId(), label: "value" },
      detections: {
        detections: [
          {
            _id: createId(),
            label: "value",
            bounding_box: [0.25, 0.25, 0.5, 0.5],
          },
        ],
      },
    }),
  });
});

/**
 * End-to-end tests for the quick-edit workflow in the sample modal.
 *
 * Each test opens the modal for the single sample in {@link DATASET_NAME}
 * (filtered by {@link ID}) and exercises the quick-edit UI for different
 * label types. Tests are run serially to avoid race conditions on shared
 * server state.
 */
test.describe.serial("quick edit", () => {
  /**
   * Before each test, navigate to the dataset grid filtered to the target
   * sample, open the modal, and assert that the looker canvas is visible.
   */
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, DATASET_NAME, {
      searchParams: new URLSearchParams({ id: ID }),
    });

    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
  });

  /**
   * Verifies that a Classification label can be opened in quick-edit mode
   * via the sidebar. Checks the tooltip content before transitioning and
   * asserts the canvas switches to the lighter (quick-edit) view.
   */
  test("classification via sidebar", async ({ modal }) => {
    // Init
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasScreenshot("classification-looker.png");

    // Show tooltip
    await modal.sampleCanvas.move(0.05, 0.03, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.assert.isLocked(false);

    // Assert tooltip content
    await modal.sampleCanvas.tooltip.assert.hasField("classification");
    await modal.sampleCanvas.tooltip.assert.hasAttribute(
      "label",
      "value",
      false,
    );

    // Transition to quick edit via the sidebar
    await modal.sidebar.quickEdit("classification");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sampleCanvas.assert.hasScreenshot("classification-lighter.png");
  });

  /**
   * Verifies that a Detection label can be opened in quick-edit mode via the
   * tooltip. Exercises all eight bounding-box handles, asserting correct
   * resize and move behavior including undo/redo for each handle. Also
   * validates that setting the `confidence` field updates the canvas.
   */
  test("detections via tooltip", async ({ modal }) => {
    // Init
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasCursor("default");

    // Show tooltip
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.assert.isLocked(false);

    // Lock tooltip
    await modal.sampleCanvas.tooltip.toggleLock();
    await modal.sampleCanvas.tooltip.assert.isLocked();

    // Assert tooltip content
    await modal.sampleCanvas.tooltip.assert.hasField("detections");
    await modal.sampleCanvas.tooltip.assert.hasAttribute(
      "label",
      "value",
      false,
    );

    // Transition to quick edit via the tooltip
    await modal.sampleCanvas.tooltip.quickEdit();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sampleCanvas.move(0.9, 0.9, "crosshair");
    await modal.sidebar.edit.assert.redoIsEnabled(false);
    await modal.sidebar.edit.assert.undoIsEnabled(false);
    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-selected-centered.png",
    );

    /**
     * Asserts that the sidebar edit fields reflect the given bounding box,
     * converting relative (0–1) coordinates to absolute pixel values.
     */
    const assertPosition = async function ({ x, y, width, height }: Box) {
      await modal.sidebar.edit.assert.verifyFieldValue(
        "position.x",
        (x * IMAGE_WIDTH).toString(),
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "position.y",
        (y * IMAGE_HEIGHT).toString(),
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "dimensions.width",
        (width * IMAGE_WIDTH).toString(),
      );
      await modal.sidebar.edit.assert.verifyFieldValue(
        "dimensions.height",
        (height * IMAGE_HEIGHT).toString(),
      );
    };

    for (const point of DETECTION_CORNERS_AND_EDGES) {
      // Resize box
      await modal.sampleCanvas.move(point.x, point.y, `${point.cursor}-resize`);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.up();
      await modal.sampleCanvas.move(point.x, point.y, "crosshair");
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}.png`,
      );
      await assertPosition(point.resize);

      // Undo
      await modal.sidebar.edit.undo();
      await modal.sidebar.edit.assert.redoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png",
      );
      await assertPosition(INITIAL_BOUNDING_BOX);

      // Redo
      await modal.sidebar.edit.redo();
      await modal.sidebar.edit.assert.redoIsEnabled(false);
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}.png`,
      );
      await assertPosition(point.resize);

      // Resize to original box
      await modal.sampleCanvas.move(0.5, 0.5, `${point.cursor}-resize`);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.up();
      await modal.sampleCanvas.move(0.9, 0.9, "crosshair");
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png",
      );
      await assertPosition(INITIAL_BOUNDING_BOX);
    }

    for (const point of DETECTION_CORNERS_AND_EDGES) {
      // Move box
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.up();
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}-move.png`,
      );
      await assertPosition(point.move);

      // Undo
      await modal.sidebar.edit.undo();
      await modal.sidebar.edit.assert.redoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png",
      );
      await assertPosition(INITIAL_BOUNDING_BOX);

      // Redo
      await modal.sidebar.edit.redo();
      await modal.sidebar.edit.assert.redoIsEnabled(false);
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        `detection-lighter-selected-${point.name}-move.png`,
      );
      await assertPosition(point.move);

      // Move back
      await modal.sampleCanvas.move(point.x, point.y);
      await modal.sampleCanvas.down();
      await modal.sampleCanvas.move(0.5, 0.5);
      await modal.sampleCanvas.up();
      await modal.sidebar.edit.assert.undoIsEnabled();
      await modal.sampleCanvas.assert.hasScreenshot(
        "detection-lighter-selected-centered.png",
      );
      await assertPosition(INITIAL_BOUNDING_BOX);
    }

    // Change confidence
    await modal.sidebar.edit.setFieldValue("confidence", "1.0");
    await modal.sampleCanvas.move(0.9, 0.9);
    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-selected-centered-confidence-1.0.png",
    );

    // Deselect
    await modal.sampleCanvas.move(0.5, 0.5, "grab");
    await modal.sampleCanvas.click(0.9, 0.9);
    await modal.sampleCanvas.move(0.9, 0.9, "default");
    await modal.sampleCanvas.assert.hasScreenshot(
      "detection-lighter-centered-confidence-1.0.png",
    );
  });
});
