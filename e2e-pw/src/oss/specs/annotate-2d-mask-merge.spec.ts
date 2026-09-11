/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D mask merge with the segmentation Merge tool: a target-click then a
 * source-click folds the source's mask into the target and deletes the source
 * as one undo unit, so the label count drops 2 → 1, persists, and a single
 * undo restores it. The seeded detections carry `_cls` so their embedded masks
 * decode, and merge needs ≥2 masked detections to enable.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-mask-merge");
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
  // a fresh pair per test so a prior test's merge doesn't bleed in
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat", "dog"],
        attributes: [],
        component: "dropdown",
      },
    },
    // two masked detections, tiled apart along x so each is clickable on canvas
    withSampleData: (_, { createId, mask }) => ({
      detections: {
        _cls: "Detections",
        detections: [
          {
            _id: createId(),
            _cls: "Detection",
            tags: [],
            label: "cat",
            bounding_box: [0.15, 0.4, 0.18, 0.2],
            mask: mask(50, 50),
          },
          {
            _id: createId(),
            _cls: "Detection",
            tags: [],
            label: "dog",
            bounding_box: [0.6, 0.4, 0.18, 0.2],
            mask: mask(50, 50),
          },
        ],
      },
    }),
  });
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
});

const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await freshModal.waitForSampleLoadDomAttribute();
    await freshModal.sidebar.switchMode("annotate");
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

test.describe.serial("2D annotation mask merge", () => {
  test("merging two masked detections absorbs the source and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.assert.verifyActiveLabelsCount(2);

    // Enter segmentation mode on the target, then activate the Merge tool.
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);
    await expect(modal.sidebar.edit.mergeTool).toBeEnabled();
    await modal.sidebar.edit.mergeTool.click();

    // First click sets the target (cat mask); the second merges the source
    // (dog mask) into it and deletes the source.
    await modal.sampleCanvas.move(0.24, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.move(0.69, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.waitForSavesSettled();

    // The source detection is absorbed + deleted → one label remains, persisted.
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await expect
        .poll(() => freshModal.sidebar.annotate.getActiveLabelsCount())
        .toBe(1);
    });
  });

  test("a merge is a single undo unit that restores the source", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);
    await modal.sidebar.edit.mergeTool.click();

    await modal.sampleCanvas.move(0.24, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.move(0.69, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sidebar.annotate.waitForSavesSettled();

    // The target bbox + async mask re-encode + source delete coalesce under one
    // gestureId, so a SINGLE undo fully restores the source.
    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await modal.sidebar.annotate.waitForSavesSettled();

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await expect
        .poll(() => freshModal.sidebar.annotate.getActiveLabelsCount())
        .toBe(2);
    });
  });
});
