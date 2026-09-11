/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * AI-assisted segmentation (SAM2) round-trip: pick the AI tool, place a
 * positive point, let the mocked worker return a deterministic mask, await its
 * autosave, and verify from a fresh browser context that the persisted
 * detection renders a non-empty mask. The worker is swapped in through the
 * `window.__FO_TEST_SAM2_WORKER_FACTORY` seam, so no weights download and no
 * inference runs.
 */

import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { LabelSchema } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";
import { installSam2MockWorker } from "src/shared/sam2-mock-worker";

const datasetName = getUniqueDatasetNameWithPrefix(
  "smoke-annotate-segmentation-ai",
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
const schema: LabelSchema = {
  type: "detections",
  classes: ["cat"],
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
  await installSam2MockWorker(page);
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: sampleId }),
  });
});

test.describe.serial("segmentation AI (SAM2) round-trip", () => {
  test("placing a positive point persists a Detection with a mask", async ({
    browser,
    fiftyoneLoader,
    modal,
  }) => {
    // ── 1. Enter annotate → segmentation → AI ───────────────────────────────
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.waitForLighterReady();

    await modal.sidebar.annotate.segmentationMode();
    await modal.sidebar.annotate.assert.segmentationModeIsActive();

    await modal.sidebar.annotate.pickTool("AI");
    await modal.sidebar.annotate.assert.toolIsActive("AI");

    // ── 2. Place a positive point — inference auto-fires on context change ──
    // inference runs in a worker: settlement alone reads "settled" before
    // the label exists, so arm the autosave response that will carry it
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sampleCanvas.click(0.5, 0.5);

    // ── 3. Wait for the inferred detection to persist ───────────────────────
    await saved;

    // The inferred detection is left selected; the create toolbar is hidden
    // while editing, so exit via the edit form rather than the toolbar.
    await modal.sidebar.edit.exitToList();

    // ── 4. A fresh browser context must show the persisted Detection ────────
    const context = await browser.newContext();
    try {
      await installSam2MockWorker(context);
      const freshPage = await context.newPage();
      await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
        searchParams: new URLSearchParams({ id: sampleId }),
      });
      const fresh = new ModalPom(freshPage, new EventUtils(freshPage));
      await fresh.waitForSampleLoadDomAttribute();
      await fresh.sidebar.switchMode("annotate");
      const rows = fresh.sidebar.annotate.labelRowsFor("instances");
      expect(await rows.count()).toBeGreaterThanOrEqual(1);

      // Mock worker's 8x8 all-foreground mask → a non-empty rendered mask.
      // Loose lower bound catches "field saved but mask empty".
      await rows.first().click();
      await fresh.sidebar.edit.assert.hasMaskPreview();
      await expect
        .poll(() => fresh.sidebar.edit.maskPreviewPixels())
        .toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
