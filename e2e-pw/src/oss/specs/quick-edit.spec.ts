/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { Page } from "@playwright/test";
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { Box, SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { indexToId } from "src/shared/utils";

/** Unique dataset name scoped to this test file, prefixed with `"quick-edit"`. */
const DATASET_NAME = getUniqueDatasetNameWithPrefix("quick-edit");

/**
 * One identical sample per test. Quick edit autosaves to the dataset, so each
 * test edits its own sample and a failed test cannot leak state into another
 * (not even a trailing autosave that hadn't flushed when the test ended).
 */
const SAMPLE_IDS = {
  classification: indexToId(0),
  tooltip: indexToId(1),
  confidence: indexToId(2),
};

/**
 * One sample per resize/move handle-group test (see {@link HANDLE_GROUPS}),
 * indexed after {@link SAMPLE_IDS}.
 */
const GESTURE_SAMPLE_IDS = {
  resize: [indexToId(3), indexToId(4), indexToId(5), indexToId(6)],
  move: [indexToId(7), indexToId(8), indexToId(9), indexToId(10)],
};

/** Total samples to seed: the per-test samples plus the per-group samples. */
const NUM_SAMPLES =
  Object.keys(SAMPLE_IDS).length +
  GESTURE_SAMPLE_IDS.resize.length +
  GESTURE_SAMPLE_IDS.move.length;

/**
 * Generated sample dimensions — matches the modal's media region (the
 * content column minus the shared media-facts bar) so the image renders at
 * viewport scale 1 and gesture geometry round-trips exactly.
 */
const IMAGE_WIDTH = 914;

/** See {@link IMAGE_WIDTH}. */
const IMAGE_HEIGHT = 584;

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

/**
 * The eight handles paired into per-test groups (a corner and its following
 * edge). One 90-second CI test cannot exercise all eight handles with
 * undo/redo on a slow runner, so each pair runs as its own test against its
 * own sample — same coverage, bounded per-test cost.
 */
const HANDLE_GROUPS = [0, 2, 4, 6].map((start) =>
  DETECTION_CORNERS_AND_EDGES.slice(start, start + 2),
);

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
 * Starts the FiftyOne web server and creates a dataset with one identical
 * sample per test (see {@link SAMPLE_IDS}), each with a `Classification` and
 * a `Detections` field. The detection is initialized to
 * {@link INITIAL_BOUNDING_BOX}.
 */
test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName: DATASET_NAME,
    numSamples: NUM_SAMPLES,
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
 * Each test opens the modal for its own sample in {@link DATASET_NAME}
 * (see {@link SAMPLE_IDS}) and exercises the quick-edit UI for different
 * label types. Quick edit autosaves, so per-test samples keep the tests
 * independent: a failure retries alone instead of re-running the whole file.
 */
test.describe("quick edit", () => {
  /**
   * Navigates to the dataset grid filtered to the given sample, opens the
   * modal, and asserts that the looker canvas is visible.
   */
  const openSample = async (
    fiftyoneLoader: AbstractFiftyoneLoader,
    page: Page,
    modal: ModalPom,
    id: string,
  ) => {
    await fiftyoneLoader.waitUntilGridVisible(page, DATASET_NAME, {
      searchParams: new URLSearchParams({ id }),
    });

    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LOOKER);
  };

  /**
   * Asserts that the sidebar edit fields reflect the given bounding box. The
   * position panel shows the stored relative (0–1) coordinates directly.
   */
  const assertPosition = async (
    modal: ModalPom,
    { x, y, width, height }: Box,
  ) => {
    await modal.sidebar.edit.assert.verifyFieldValue(
      "position.x",
      x.toString(),
    );
    await modal.sidebar.edit.assert.verifyFieldValue(
      "position.y",
      y.toString(),
    );
    await modal.sidebar.edit.assert.verifyFieldValue(
      "dimensions.width",
      width.toString(),
    );
    await modal.sidebar.edit.assert.verifyFieldValue(
      "dimensions.height",
      height.toString(),
    );
  };

  /**
   * Opens the detection in quick-edit mode via the tooltip and waits for the
   * lighter (quick-edit) canvas. Shared entry point for the detection tests
   * below; tooltip content itself is covered by "detections via tooltip".
   */
  const enterDetectionQuickEdit = async (modal: ModalPom) => {
    await modal.sampleCanvas.move(0.5, 0.5, "pointer");
    await modal.sampleCanvas.tooltip.assert.isVisible();
    await modal.sampleCanvas.tooltip.toggleLock();
    await modal.sampleCanvas.tooltip.quickEdit();
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.sampleCanvas.move(0.9, 0.9, "crosshair");
  };

  /**
   * Verifies that a Classification label can be opened in quick-edit mode
   * via the sidebar. Checks the tooltip content before transitioning and
   * asserts the canvas switches to the lighter (quick-edit) view.
   */
  test("classification via sidebar", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openSample(fiftyoneLoader, page, modal, SAMPLE_IDS.classification);

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
   * tooltip. Checks the tooltip content and lock behavior before
   * transitioning and asserts the canvas switches to the lighter
   * (quick-edit) view with an empty undo/redo history.
   */
  test("detections via tooltip", async ({ fiftyoneLoader, modal, page }) => {
    await openSample(fiftyoneLoader, page, modal, SAMPLE_IDS.tooltip);

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
    await assertPosition(modal, INITIAL_BOUNDING_BOX);
  });

  /**
   * Exercises the bounding-box handles of one {@link HANDLE_GROUPS} pair,
   * asserting correct resize behavior including undo/redo for each handle.
   * Each handle restores the initial bounding box. Geometry is asserted
   * semantically for every handle and step; rendering is screenshot-asserted
   * once per handle after the resize, and the undo/redo/restore visual
   * round-trip once per gesture (the very first handle) — the reprojection
   * path is the same for every handle.
   */
  HANDLE_GROUPS.forEach((group, groupIndex) => {
    const names = group.map((point) => point.name).join(" and ");

    test(`detection resize via ${names} handles with undo/redo`, async ({
      fiftyoneLoader,
      modal,
      page,
    }) => {
      await openSample(
        fiftyoneLoader,
        page,
        modal,
        GESTURE_SAMPLE_IDS.resize[groupIndex],
      );
      await enterDetectionQuickEdit(modal);

      for (const point of group) {
        const withRoundTripScreenshots = groupIndex === 0 && point === group[0];

        // Resize box
        await modal.sampleCanvas.move(
          point.x,
          point.y,
          `${point.cursor}-resize`,
        );
        await modal.sampleCanvas.down();
        await modal.sampleCanvas.move(0.5, 0.5);
        await modal.sampleCanvas.up();
        await modal.sampleCanvas.move(point.x, point.y, "crosshair");
        await modal.sidebar.edit.assert.undoIsEnabled();
        await modal.sampleCanvas.assert.hasScreenshot(
          `detection-lighter-selected-${point.name}.png`,
        );
        await assertPosition(modal, point.resize);

        // Undo
        await modal.sidebar.edit.undo();
        await modal.sidebar.edit.assert.redoIsEnabled();
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            "detection-lighter-selected-centered.png",
          );
        }
        await assertPosition(modal, INITIAL_BOUNDING_BOX);

        // Redo
        await modal.sidebar.edit.redo();
        await modal.sidebar.edit.assert.redoIsEnabled(false);
        await modal.sidebar.edit.assert.undoIsEnabled();
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            `detection-lighter-selected-${point.name}.png`,
          );
        }
        await assertPosition(modal, point.resize);

        // Resize to original box
        await modal.sampleCanvas.move(0.5, 0.5, `${point.cursor}-resize`);
        await modal.sampleCanvas.down();
        await modal.sampleCanvas.move(point.x, point.y);
        await modal.sampleCanvas.up();
        await modal.sampleCanvas.move(0.9, 0.9, "crosshair");
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            "detection-lighter-selected-centered.png",
          );
        }
        await assertPosition(modal, INITIAL_BOUNDING_BOX);
      }
    });
  });

  /**
   * Drags the detection to each handle position of one {@link HANDLE_GROUPS}
   * pair, asserting correct move behavior including undo/redo for each
   * position. Each position restores the initial bounding box. Screenshot
   * policy matches the resize tests: rendering once per position after the
   * move, the undo/redo/restore visual round-trip once per gesture.
   */
  HANDLE_GROUPS.forEach((group, groupIndex) => {
    const names = group.map((point) => point.name).join(" and ");

    test(`detection move to ${names} with undo/redo`, async ({
      fiftyoneLoader,
      modal,
      page,
    }) => {
      await openSample(
        fiftyoneLoader,
        page,
        modal,
        GESTURE_SAMPLE_IDS.move[groupIndex],
      );
      await enterDetectionQuickEdit(modal);

      for (const point of group) {
        const withRoundTripScreenshots = groupIndex === 0 && point === group[0];

        // Move box
        await modal.sampleCanvas.move(0.5, 0.5);
        await modal.sampleCanvas.down();
        await modal.sampleCanvas.move(point.x, point.y);
        await modal.sampleCanvas.up();
        await modal.sidebar.edit.assert.undoIsEnabled();
        await modal.sampleCanvas.assert.hasScreenshot(
          `detection-lighter-selected-${point.name}-move.png`,
        );
        await assertPosition(modal, point.move);

        // Undo
        await modal.sidebar.edit.undo();
        await modal.sidebar.edit.assert.redoIsEnabled();
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            "detection-lighter-selected-centered.png",
          );
        }
        await assertPosition(modal, INITIAL_BOUNDING_BOX);

        // Redo
        await modal.sidebar.edit.redo();
        await modal.sidebar.edit.assert.redoIsEnabled(false);
        await modal.sidebar.edit.assert.undoIsEnabled();
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            `detection-lighter-selected-${point.name}-move.png`,
          );
        }
        await assertPosition(modal, point.move);

        // Move back
        await modal.sampleCanvas.move(point.x, point.y);
        await modal.sampleCanvas.down();
        await modal.sampleCanvas.move(0.5, 0.5);
        await modal.sampleCanvas.up();
        await modal.sidebar.edit.assert.undoIsEnabled();
        if (withRoundTripScreenshots) {
          await modal.sampleCanvas.assert.hasScreenshot(
            "detection-lighter-selected-centered.png",
          );
        }
        await assertPosition(modal, INITIAL_BOUNDING_BOX);
      }
    });
  });

  /**
   * Validates that setting the `confidence` field updates the canvas, and
   * that deselecting the detection keeps the edited value. The confidence
   * change persists, but only to this test's own sample.
   */
  test("detection confidence edit", async ({ fiftyoneLoader, modal, page }) => {
    await openSample(fiftyoneLoader, page, modal, SAMPLE_IDS.confidence);
    await enterDetectionQuickEdit(modal);

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
