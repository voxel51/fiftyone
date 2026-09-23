/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Visual smoke tests for each segmentation tool. Each test draws with one
 * tool, states what that tool leaves behind (selection, mask, label count),
 * then puts the canvas back to the same deselected state before snapshotting,
 * so a pixel diff can only mean the mask render changed — shape, color,
 * position or antialiasing. Selection chrome is deliberately kept out of the
 * baselines: a selected mask draws a dashed outline, which would otherwise
 * pin whichever tool happens to deselect on its own.
 *
 * Determinism comes from the fixed class "cat" (label colors hash the string),
 * moving the mouse off-canvas before snapshotting, finalizing the AI keypoint
 * session so its ripple isn't captured, and pre-seeding the merge test's two
 * masks, with baselines captured on the CI platform (linux/Chromium).
 */

import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type {
  ImageDatasetOptions,
  LabelSchema,
} from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";

const SAMPLE_ID = "000000000000000000000000";
const FIELD = "instances";

const schema: LabelSchema = {
  type: "detections",
  classes: ["cat"],
  attributes: [],
  component: "dropdown",
};

// Two adjacent masked cats for the merge test to operate on.
const twoMaskedCats: Pick<ImageDatasetOptions, "withSampleData"> = {
  withSampleData: (_, { createId, mask }) => ({
    [FIELD]: {
      _cls: "Detections",
      detections: [
        [0.25, 0.4, 0.2, 0.2],
        [0.55, 0.4, 0.2, 0.2],
      ].map((bounding_box) => ({
        _id: createId(),
        _cls: "Detection",
        tags: [] as string[],
        label: "cat",
        bounding_box,
        mask: mask(50, 50),
      })),
    },
  }),
};

const test = base.extend<{
  modal: ModalPom;
  datasetName: string;
  seed: Pick<ImageDatasetOptions, "withSampleData">;
}>({
  seed: [{}, { option: true }],
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  // Fresh dataset per test. Uses the test title so each baseline is
  // colocated with its corresponding dataset's render.
  datasetName: async ({ datasetFactory, seed }, use, testInfo) => {
    const name = getUniqueDatasetNameWithPrefix(
      `seg-snap-${testInfo.title.replace(/\s+/g, "-")}`,
    );

    await datasetFactory.createDataset({
      datasetName: name,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: { [FIELD]: "Detections" },
      labelSchemas: {
        [FIELD]: schema,
      },
      ...seed,
    });

    await use(name);
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const openAnnotate = async (
  modal: ModalPom,
  page: import("@playwright/test").Page,
  fiftyoneLoader: import("src/shared/abstract-loader").AbstractFiftyoneLoader,
  datasetName: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: SAMPLE_ID }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.waitForLighterReady();
  await modal.sidebar.annotate.segmentationMode();
  await modal.sidebar.annotate.assert.segmentationModeIsActive();
};

/**
 * The state every baseline here is captured in: masks committed, nothing
 * selected. The Select tool turns a click on empty canvas into a deselect,
 * and the closed edit form is the signal that it landed.
 */
const deselectForSnapshot = async (modal: ModalPom) => {
  await modal.sidebar.annotate.pickTool("Select");
  await modal.sidebar.annotate.assert.toolIsActive("Select");
  await modal.sampleCanvas.clickEmptyArea();
  await modal.sidebar.edit.assert.isClosed();
};

/**
 * The field's one label carries a mask. Selecting the row is what mounts the
 * preview, so this runs after a snapshot, never before one.
 */
const assertOnlyLabelHasMask = async (modal: ModalPom) => {
  await modal.sidebar.annotate.labelRowsFor(FIELD).click();
  await modal.sidebar.edit.assert.hasMaskPreview();
};

test.describe.serial("segmentation tool snapshots", () => {
  test("pen", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Pen");
    await modal.sidebar.annotate.assert.toolIsActive("Pen");

    // Rectangle polygon centered on the canvas, committed with a right-click
    await modal.sampleCanvas.click(0.4, 0.4);
    await modal.sampleCanvas.click(0.6, 0.4);
    await modal.sampleCanvas.click(0.6, 0.6);
    await modal.sampleCanvas.click(0.4, 0.6);
    await modal.sampleCanvas.rightClick(0.5, 0.5);

    await modal.sidebar.annotate.waitForSavesSettled();

    // The commit right-click deselects the polygon and returns to the list.
    await modal.sidebar.edit.assert.isClosed();

    await deselectForSnapshot(modal);
    await modal.sidebar.annotate.assert.labelRowCount(FIELD, 1);

    await modal.sampleCanvas.assert.hasScreenshot("seg-pen-rectangle.png");

    await assertOnlyLabelHasMask(modal);
  });

  test("brush", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Brush");
    await modal.sidebar.annotate.assert.toolIsActive("Brush");

    // Single diagonal stroke. drag() generates intermediate moves so the
    // brush dabs continuously instead of only at the endpoints.
    await modal.sampleCanvas.drag(0.35, 0.4, 0.65, 0.6);

    await modal.sidebar.annotate.waitForSavesSettled();

    // A stroke leaves its new mask selected with the edit form open — unlike
    // pen and AI, the brush has no commit gesture that deselects.
    await modal.sidebar.edit.assert.isOpen();
    await modal.sidebar.edit.assert.hasMaskPreview();

    await deselectForSnapshot(modal);
    await modal.sidebar.annotate.assert.labelRowCount(FIELD, 1);

    await modal.sampleCanvas.assert.hasScreenshot("seg-brush-stroke.png");
  });

  test("ai", async ({
    datasetName,
    fiftyoneLoader,
    mockSam2Worker,
    modal,
    page,
  }) => {
    // `mockSam2Worker` fixture installed the deterministic worker before
    // page navigation; nothing to do here.
    void mockSam2Worker;

    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("AI");
    await modal.sidebar.annotate.assert.toolIsActive("AI");

    // One positive point near the center; mock worker returns a
    // deterministic 8x8 all-foreground mask at bbox {0.4, 0.4, 0.2, 0.2}.
    // inference runs in a worker: settlement alone reads "settled" before
    // the label exists, so arm the autosave response that will carry it
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sampleCanvas.click(0.5, 0.5);
    await saved;

    // Right-click to finalize the AI session: destroys the keypoint
    // overlay (and its ripple animation), leaving only the mask render.
    await modal.sampleCanvas.rightClick(0.5, 0.5);

    // The same right-click deselects the committed detection.
    await modal.sidebar.edit.assert.isClosed();

    await deselectForSnapshot(modal);
    await modal.sidebar.annotate.assert.labelRowCount(FIELD, 1);

    await modal.sampleCanvas.assert.hasScreenshot("seg-ai-mask.png");

    await assertOnlyLabelHasMask(modal);
  });

  test.describe("merge", () => {
    test.use({ seed: twoMaskedCats });

    test("merge", async ({
      browser,
      datasetName,
      fiftyoneLoader,
      modal,
      page,
    }) => {
      await openAnnotate(modal, page, fiftyoneLoader, datasetName);
      await modal.sidebar.annotate.pickTool("Merge");
      await modal.sidebar.annotate.assert.toolIsActive("Merge");

      // Click the first detection to set as merge target, then the second
      // detection to merge into the target.
      await modal.sampleCanvas.click(0.35, 0.5);
      await modal.sampleCanvas.click(0.65, 0.5);

      await modal.sidebar.annotate.waitForSavesSettled();

      // The merge selects its target once the source delete lands, so the
      // union is on screen as a selected, masked detection.
      await modal.sidebar.edit.assert.isOpen();
      await modal.sidebar.edit.assert.hasMaskPreview();

      await deselectForSnapshot(modal);
      await modal.sidebar.annotate.assert.labelRowCount(FIELD, 1);

      await modal.sampleCanvas.assert.hasScreenshot("seg-merge-union.png");

      // Sanity check: the merge persisted the pair as a single masked detection.
      const context = await browser.newContext();
      const freshPage = await context.newPage();
      try {
        const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
        await openAnnotate(freshModal, freshPage, fiftyoneLoader, datasetName);
        await freshModal.sidebar.annotate.assert.labelRowCount(FIELD, 1);
        await assertOnlyLabelHasMask(freshModal);
        await freshModal.sampleCanvas.assert.hasScreenshot(
          "seg-merge-persisted.png",
        );
      } finally {
        await context.close();
      }
    });
  });
});
