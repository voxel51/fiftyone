/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * AI-assisted segmentation (SAM2) round-trip: enter segmentation mode, pick
 * the AI tool, place a positive point, let the mocked SAM2 worker return a
 * deterministic mask, wait for auto-save to persist it, reload the page,
 * then query the persisted sample from Python to verify a Detection with a
 * non-empty mask was saved.
 *
 * Pairs with the pen-tool round-trip spec to cover the second main
 * segmentation-creation path. Together they guard the lighter → delta-
 * supplier → patchSample chain for both manual and AI-assisted flows.
 *
 * The real SAM2 worker is replaced via the `window.__FO_TEST_SAM2_WORKER_FACTORY`
 * seam on `BrowserAnnotationProvider`, so no ONNX weights are downloaded
 * and no model inference runs.
 */

import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SAM2_MOCK_WORKER_SRC } from "src/shared/sam2-mock-worker";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-segmentation-ai"
);

const test = base.extend<{
  modal: ModalPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

// Minimal Detections schema — the mock worker creates the mask at runtime;
// the schema only needs to declare the field type and available classes.
const schema: Record<string, unknown> = {
  type: "detections",
  classes: ["cat"],
  attributes: [],
  component: "dropdown",
};

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
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
  // Install the mock worker BEFORE the page mounts BrowserAnnotationProvider.
  // The factory wraps the worker source in a Blob URL so it runs in a real
  // Worker context — same shape as the production worker.
  await page.addInitScript((workerSrc: string) => {
    (window as unknown as {
      __FO_TEST_SAM2_WORKER_FACTORY?: () => Worker;
    }).__FO_TEST_SAM2_WORKER_FACTORY = () => {
      const blob = new Blob([workerSrc], { type: "text/javascript" });
      return new Worker(URL.createObjectURL(blob));
    };
  }, SAM2_MOCK_WORKER_SRC);

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
  });
});

test.describe.serial("segmentation AI (SAM2) round-trip", () => {
  test("placing a positive point persists a Detection with a mask", async ({
    annotateSDK,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // ── 1. Enter annotate → segmentation → AI ───────────────────────────────
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.annotate.assert.segmentationModeIsActive();

    await modal.sidebar.annotate.pickTool("AI");
    await modal.sidebar.annotate.assert.toolIsActive("AI");

    // Set up the persistence wait BEFORE clicking so we don't race the
    // 3s auto-save timer. Clicking a point auto-triggers inference, and
    // the resulting detection is picked up by the next auto-save tick.
    const persistResponse = modal.sidebar.annotate.waitForPatch();

    // ── 2. Place a positive point — inference auto-fires on context change ──
    await modal.sampleCanvas.click(0.5, 0.5);

    // ── 3. Wait for auto-save to flush, then exit segmentation mode ─────────
    await persistResponse;

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.annotate.assert.segmentationModeIsActive(false);

    // ── 4. Reload and verify the Detection survived ─────────────────────────
    await page.reload();
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id: "000000000000000000000000" }),
    });

    const state = await annotateSDK.getDetectionsState(datasetName, "instances");

    expect(state.present).toBe(true);
    expect(state.count).toBeGreaterThanOrEqual(1);
    // Mock worker's 8x8 all-foreground mask → 64 binary pixels after
    // normalizeMask. Loose lower bound catches "field saved but mask empty".
    expect(state.maskPixels).toBeGreaterThan(0);
  });
});
