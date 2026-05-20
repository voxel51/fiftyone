/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pen-tool round-trip: enter segmentation mode, draw a polygon mask via the
 * pen tool, commit it (right-click), wait for auto-save to flush, reload the
 * page, then query the persisted sample from Python to verify a Detection
 * with a non-empty mask was saved.
 *
 * This is the primary data-integrity test for the manual segmentation flow.
 * Anything that breaks the lighter → delta-supplier → patchSample chain or
 * the pen handler's commit path should make this fail.
 */

import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-segmentation-pen"
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

// Minimal Detections schema. `label` is implicit (via `classes`) and `mask`
// is the rendered mask payload — not a schema-declared attribute. The pen
// tool creates the mask at runtime; the schema only needs to declare the
// field as `detections` with available classes.
const schema: Record<string, unknown> = {
  type: "detections",
  classes: ["cat", "dog"],
  attributes: [],
  component: "dropdown",
};

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  // The Segmentation entry point in the annotate sidebar is gated behind
  // VFF_AI_SEGMENTATION on the server side. Enable it for this spec so
  // `segmentation-mode` renders. The Python server inherits this from our env.
  process.env.VFF_AI_SEGMENTATION = "true";

  await foWebServer.startWebServer();
  await datasetFactory.createBlankDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: {
      instances: "Detections",
    },
  });

  await annotateSDK.updateLabelSchema(datasetName, "instances", schema);
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "instances");
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
    annotateSDK,
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

    // Auto-save runs on a 3 s interval (`useAutoSave`); set up the response
    // wait BEFORE we start interacting so we don't race the timer.
    const persistResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === "PATCH" &&
        /\/dataset\/[^/]+\/sample\//.test(resp.url()) &&
        resp.status() < 400,
      { timeout: 15_000 }
    );

    // ── 2. Place 4 pen points forming a rectangle, then right-click commit ──
    // First click in segmentation+pen mode creates the new overlay; subsequent
    // clicks add pen keypoints onto it.
    await modal.sampleCanvas.click(0.4, 0.4);
    await modal.sampleCanvas.click(0.6, 0.4);
    await modal.sampleCanvas.click(0.6, 0.6);
    await modal.sampleCanvas.click(0.4, 0.6);

    await modal.sampleCanvas.rightClick(0.5, 0.5);

    // ── 3. Wait for autosave to flush, then exit segmentation mode ──────────
    await persistResponse;

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.annotate.assert.segmentationModeIsActive(false);

    // ── 4. Reload the page; verify it doesn't drop the persisted Detection ──
    await page.reload();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    // ── 5. Verify from Python that the saved sample has a non-empty mask ────
    const state = await annotateSDK.getDetectionsState(datasetName, "instances");

    expect(state.present).toBe(true);
    expect(state.count).toBeGreaterThanOrEqual(1);
    // Pen polygon covered ~20% × 20% of a 640×480 image → ~12k pixels at the
    // image scale, but masks are usually stored at the detection bbox scale.
    // A loose lower bound catches "the field saved but the mask is empty".
    expect(state.maskPixels).toBeGreaterThan(0);
  });
});
