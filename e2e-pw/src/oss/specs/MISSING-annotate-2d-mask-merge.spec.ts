/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 2D mask MERGE (the segmentation Merge tool) — brush-free. Two masked
 * detections are seeded; with the Merge tool active, a target-click then a
 * source-click merges the source's mask into the target and DELETES the source.
 * The whole gesture (target bbox + async mask re-encode + source delete) is one
 * coalesced undo unit (a single `gestureId`), so:
 *   - the source is absorbed (label count 2 → 1) and the merge persists,
 *   - a single undo restores the source (count → 2).
 *
 * Masks are seeded via `fo.Detection` so the embedded mask carries `_cls` and
 * decodes (see MISSING-annotate-2d-mask.spec.ts for why the factory JSON path
 * doesn't). Merge needs ≥2 masked detections in the field for the tool to enable.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-mask-merge");
const id = "000000000000000000000000";

const isSamplePatch = (method: string) =>
  ["POST", "PATCH", "PUT"].includes(method);

/** Two masked detections, tiled apart along x so each is clickable on canvas. */
const seedDetections = () => `
import fiftyone as fo
import numpy as np

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
sample.detections = fo.Detections(detections=[
    fo.Detection(label="cat", bounding_box=[0.15, 0.4, 0.18, 0.2],
                 mask=np.ones((50, 50), dtype=bool)),
    fo.Detection(label="dog", bounding_box=[0.6, 0.4, 0.18, 0.2],
                 mask=np.ones((50, 50), dtype=bool)),
])
sample.save()
`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(
  async ({ annotateSDK, datasetFactory, fiftyoneLoader, foWebServer }) => {
    await foWebServer.startWebServer();
    await datasetFactory.createDataset({
      datasetName,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: { detections: "Detections" },
    });
    await fiftyoneLoader.executePythonCode(seedDetections());
    await annotateSDK.updateLabelSchema(datasetName, "detections", {
      type: "detections",
      classes: ["cat", "dog"],
      attributes: [],
      component: "dropdown",
    });
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
  },
);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
  // Re-seed both detections so a prior test's merge doesn't bleed in.
  await fiftyoneLoader.executePythonCode(seedDetections());
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
    page,
  }) => {
    await modal.sidebar.annotate.assert.verifyActiveLabelsCount(2);

    // Enter segmentation mode on the target, then activate the Merge tool.
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);
    await expect(modal.sidebar.edit.mergeTool).toBeEnabled();
    await modal.sidebar.edit.mergeTool.click();

    // First click sets the target (cat mask); the second merges the source
    // (dog mask) into it and deletes the source.
    const saved = page.waitForResponse(
      (r) => /\/sample\//.test(r.url()) && isSamplePatch(r.request().method()),
    );
    await modal.sampleCanvas.move(0.24, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await modal.sampleCanvas.move(0.69, 0.5);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.up();
    await saved;

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
    page,
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

    // The target bbox + async mask re-encode + source delete coalesce under one
    // gestureId, so a SINGLE undo fully restores the source.
    await modal.sidebar.edit.assert.undoIsEnabled();
    const restored = page.waitForResponse(
      (r) => /\/sample\//.test(r.url()) && isSamplePatch(r.request().method()),
    );
    await modal.sidebar.edit.undo();
    await restored;

    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await expect
        .poll(() => freshModal.sidebar.annotate.getActiveLabelsCount())
        .toBe(2);
    });
  });
});
