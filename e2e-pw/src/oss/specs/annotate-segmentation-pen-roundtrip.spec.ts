/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pen-tool round-trip: draw a polygon mask in segmentation mode, commit with a
 * right-click, wait for autosave, reload, and verify the persisted detection
 * renders a non-empty mask. Anything breaking the lighter → delta-supplier →
 * patchSample chain or the pen commit path fails here.
 */

import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { LabelSchema } from "src/shared/dataset-factory";

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

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
  });
});

test.describe.serial("segmentation pen-tool round-trip", () => {
  test("draws a mask polygon, persists it, and the mask survives reload", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // ── 1. Enter annotate → segmentation mode → pick Pen ─────────────────────
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

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

    // ── 4. Reload the page; verify it doesn't drop the persisted Detection ──
    await page.reload();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    // ── 5. Verify the reloaded sample lists the detection with its mask ─────
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");
    const rows = modal.sidebar.annotate.labelRowsFor("instances");
    expect(await rows.count()).toBeGreaterThanOrEqual(1);

    // Pen polygon covered ~20% × 20% of the image; a non-empty rendered mask
    // catches "the field saved but the mask is empty".
    await rows.first().click();
    await modal.sidebar.edit.assert.hasMaskPreview();
    await expect
      .poll(() => modal.sidebar.edit.maskPreviewPixels())
      .toBeGreaterThan(0);
  });
});
