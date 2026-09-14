/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pen-tool round-trip: draw a polygon mask in segmentation mode, commit with a
 * right-click, wait for autosave, and verify from a fresh browser context that
 * the persisted detection renders a non-empty mask. Anything breaking the lighter → delta-supplier →
 * patchSample chain or the pen commit path fails here.
 */

import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { LabelSchema } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-segmentation-pen",
);

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

// minimal Detections schema: `label` is implicit via `classes` and the mask
// is created at runtime, not a schema-declared attribute
const schema: LabelSchema = {
  type: "detections",
  classes: ["cat", "dog"],
  attributes: [],
  component: "dropdown",
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      instances: "Detections",
    },
    labelSchemas: {
      instances: schema,
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const sampleId = "000000000000000000000000";

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: sampleId }),
  });
});

test.describe.serial("segmentation pen-tool round-trip", () => {
  test("draws a mask polygon, persists it, and the mask survives reload", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    // ── 1. Enter annotate → segmentation mode → pick Pen ─────────────────────
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.waitForLighterReady();

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.annotate.assert.segmentationModeIsActive();

    await modal.sidebar.annotate.pickTool("Pen");
    await modal.sidebar.annotate.assert.toolIsActive("Pen");

    // ── 2. Place 4 pen points forming a rectangle, then right-click commit ──
    // First click in segmentation+pen mode creates the new overlay; subsequent
    // clicks add pen keypoints onto it.
    await modal.sampleCanvas.click(0.4, 0.4);
    await modal.sampleCanvas.click(0.6, 0.4);
    await modal.sampleCanvas.click(0.6, 0.6);
    await modal.sampleCanvas.click(0.4, 0.6);

    await modal.sampleCanvas.rightClick(0.5, 0.5);

    // ── 3. Wait for autosave to flush, then exit the edit form ──────────────
    // The pen commit leaves the new detection selected; the create toolbar is
    // hidden while editing, so exit via the edit form rather than the toolbar.
    await modal.sidebar.annotate.waitForSavesSettled();

    await modal.sidebar.edit.exitToList();

    // ── 4. A fresh browser context must list the detection with its mask ────
    const context = await browser.newContext();
    try {
      const freshPage = await context.newPage();
      await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
        searchParams: new URLSearchParams({ id: sampleId }),
      });
      const fresh = new ModalPom(freshPage, new EventUtils(freshPage));
      await fresh.waitForSampleLoadDomAttribute();
      await fresh.sidebar.switchMode("annotate");
      const rows = fresh.sidebar.annotate.labelRowsFor("instances");
      await expect(rows).toHaveCount(1);

      // the pen rectangle spanned [0.4, 0.6] on both axes. The rasterized
      // polygon runs a stroke's width outside the click points (sized in
      // screen pixels, so not a fixed fraction), so its box encloses that
      // square within a small pad, and the mask fills the box.
      await rows.click();
      await fresh.sidebar.edit.assert.hasMaskPreview();
      const [x, y, width, height] = await fresh.sidebar.edit.readBoundingBox();
      const padding = 0.02;
      expect(x).toBeLessThanOrEqual(0.4);
      expect(x).toBeGreaterThan(0.4 - padding);
      expect(y).toBeLessThanOrEqual(0.4);
      expect(y).toBeGreaterThan(0.4 - padding);
      expect(x + width).toBeGreaterThanOrEqual(0.6);
      expect(x + width).toBeLessThan(0.6 + padding);
      expect(y + height).toBeGreaterThanOrEqual(0.6);
      expect(y + height).toBeLessThan(0.6 + padding);
      await fresh.sidebar.edit.assert.maskPreviewCoverage(1);
    } finally {
      await context.close();
    }
  });
});
