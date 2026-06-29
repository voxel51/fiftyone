/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Cross-surface annotation undo: the canvas (Lighter) and the sidebar edit form
 * write to ONE shared command stack through the annotation engine, so undo/redo
 * unwinds actions in LIFO order regardless of which surface produced them.
 *
 * Complements MISSING-annotate-edit.spec.ts (single-surface attribute edit) by
 * exercising the engine-routed geometry edit path (Position.tsx → createPushAndExec)
 * and interleaving it with a canvas draw. Semantic assertions (field values, the
 * engine-derived Labels count, undo/redo enabled state) — no screenshots.
 *
 * Canvas gestures (draw, drag) are engine-routed: drag-end commits through the
 * Lighter bridge (lighter:overlay-drag-end → surface.commit) which captures an
 * undo entry, so the sidebar undo/redo toolbar unwinds them too.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-cross-surface-undo",
);

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
    withSampleData: (_, { createId }) => ({
      detections: {
        detections: [
          { _id: createId(), label: "cat", bounding_box: [0.4, 0.4, 0.2, 0.2] },
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

test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
});

/** Poll the engine-derived Labels count until it settles on `expected`. */
const expectLabelsCount = async (modal: ModalPom, expected: number) => {
  await expect
    .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
    .toBe(expected);
};

/** Read a numeric edit-form field value (the 2D sidebar shows relative [0,1]). */
const fieldNum = async (modal: ModalPom, path: string) =>
  Number(await modal.sidebar.edit.getFieldValue(path));

/** Draw a detection box across the given relative corners (annotate mode). */
const drawBox = async (
  modal: ModalPom,
  from: [number, number],
  to: [number, number],
) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(from[0], from[1], "crosshair");
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(to[0], to[1]);
  await modal.sampleCanvas.up();
};

test.describe.serial("annotation cross-surface undo", () => {
  // serial tests share one dataset; the seeded "cat" box is restored within each
  // test (every edit is undone), and drawn boxes are removed via create-undo, so
  // the dataset returns to its baseline shape between tests.

  test("a sidebar geometry edit commits through the engine and is undoable", async ({
    modal,
  }) => {
    // selecting a row opens the edit form (form follows the anchor)
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);

    const before = await fieldNum(modal, "position.x");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // the number input commits a transform through the engine (Position.tsx →
    // createPushAndExec); the form re-syncs from the engine's committed bounds
    await modal.sidebar.edit.setFieldValue("position.x", "0.1");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.1, 4);
    await modal.sidebar.edit.assert.undoIsEnabled();

    // undo reverts to the committed baseline; redo re-applies
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 4);

    await modal.sidebar.edit.redo();
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.1, 4);

    // leave the seeded box at its baseline for sibling tests
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 4);
  });

  test("a canvas drag commits through the engine and is undoable", async ({
    modal,
  }) => {
    // select the seeded box (opens the form + selects the overlay for dragging)
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    const before = await fieldNum(modal, "position.x");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // drag the box body from its center toward the bottom-right; drag-end commits
    // a transform through the engine (lighter:overlay-drag-end → surface.commit).
    // Assert DIRECTIONALLY + via round-trip: container→media letterboxing makes the
    // exact moved coordinate unpredictable, but the move and its inverse are exact.
    // step the drag through intermediate moves (a single jump can read as a
    // teleport that Lighter never registers as a drag → no commit); this mirrors
    // the canvas POM's own drag() helper.
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.55, 0.55);
    await modal.sampleCanvas.move(0.6, 0.6);
    await modal.sampleCanvas.up();

    await expect
      .poll(() => fieldNum(modal, "position.x"), { timeout: 15_000 })
      .toBeGreaterThan(before + 0.02);
    const moved = await fieldNum(modal, "position.x");
    await modal.sidebar.edit.assert.undoIsEnabled();

    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 3);

    await modal.sidebar.edit.redo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(moved, 3);

    // leave the seeded box at its baseline for sibling tests
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 3);
  });

  test("a canvas draw and a sidebar edit share one LIFO undo stack", async ({
    modal,
  }) => {
    const before = await modal.sidebar.annotate.getActiveLabelsCount();

    // surface A: draw a new box on the canvas — auto-opens its edit form
    await drawBox(modal, [0.7, 0.7], [0.88, 0.88]);
    const drawnX = await fieldNum(modal, "position.x");

    // surface B: edit that box's geometry through the sidebar form
    await modal.sidebar.edit.setFieldValue("position.x", "0.15");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.15, 4);

    // undo #1 reverts the sidebar edit (most recent command) — the box survives
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(drawnX, 4);

    // undo #2 unwinds the canvas draw (earlier command, different surface) — the
    // label is removed and the form returns to the list at the baseline count
    await modal.sidebar.edit.undo();
    await expectLabelsCount(modal, before);

    // redo restores them in order: the draw first, then the sidebar edit
    await modal.sidebar.edit.redo();
    await expectLabelsCount(modal, before + 1);

    await modal.sidebar.annotate.selectActiveLabel("cat", 1);
    await modal.sidebar.edit.redo();
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.15, 4);

    // clean up: undo the whole stack so the drawn box doesn't persist into
    // sibling tests
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.undo();
    await expectLabelsCount(modal, before);
  });
});
