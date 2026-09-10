/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Visual smoke tests for each segmentation tool: each test creates a
 * deterministic mask render and snapshots the canvas, so regressions in mask
 * shape, color, position or antialiasing surface as pixel diffs. Determinism
 * comes from the fixed class "cat" (label colors hash the string), moving the
 * mouse off-canvas before snapshotting, finalizing the AI keypoint session so
 * its ripple isn't captured, and pre-seeding the merge test's two masks, with
 * baselines captured on the CI platform (linux/Chromium).
 */

import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type {
  ImageDatasetOptions,
  LabelSchema,
} from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";

const SAMPLE_ID = "000000000000000000000000";

const schema: LabelSchema = {
  type: "detections",
  classes: ["cat"],
  attributes: [],
  component: "dropdown",
};

// Two adjacent masked cats for the merge test to operate on.
const twoMaskedCats: Pick<ImageDatasetOptions, "withSampleData"> = {
  withSampleData: (_, { createId, mask }) => ({
    instances: {
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
      schema: { instances: "Detections" },
      labelSchemas: {
        instances: schema,
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

test.describe.serial("segmentation tool snapshots", () => {
  test("pen", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Pen");

    // Rectangle polygon centered on the canvas
    await modal.sampleCanvas.click(0.4, 0.4);
    await modal.sampleCanvas.click(0.6, 0.4);
    await modal.sampleCanvas.click(0.6, 0.6);
    await modal.sampleCanvas.click(0.4, 0.6);
    await modal.sampleCanvas.rightClick(0.5, 0.5);

    await modal.sidebar.annotate.waitForSavesSettled();

    await modal.sampleCanvas.assert.hasScreenshot("seg-pen-rectangle.png");
  });

  test("brush", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Brush");

    // Single diagonal stroke. drag() generates intermediate moves so the
    // brush dabs continuously instead of only at the endpoints.
    await modal.sampleCanvas.drag(0.35, 0.4, 0.65, 0.6);

    await modal.sidebar.annotate.waitForSavesSettled();

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

    await modal.sampleCanvas.assert.hasScreenshot("seg-ai-mask.png");
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

      // Click the first detection to set as merge target, then the second
      // detection to merge into the target.
      await modal.sampleCanvas.click(0.35, 0.5);
      await modal.sampleCanvas.click(0.65, 0.5);

      await modal.sidebar.annotate.waitForSavesSettled();

      await modal.sampleCanvas.assert.hasScreenshot("seg-merge-union.png");

      // Sanity check: the merge persisted the pair as a single masked detection.
      const context = await browser.newContext();
      const freshPage = await context.newPage();
      try {
        const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
        await openAnnotate(freshModal, freshPage, fiftyoneLoader, datasetName);
        const rows = freshModal.sidebar.annotate.labelRowsFor("instances");
        await expect(rows).toHaveCount(1);
        await rows.click();
        await freshModal.sidebar.edit.assert.hasMaskPreview();
        await expect
          .poll(() => freshModal.sidebar.edit.maskPreviewPixels())
          .toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });
  });
});
