/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Visual smoke tests for each segmentation tool. Each test creates a
 * deterministic mask render and snapshots the canvas, so regressions in
 * mask shape / color / position / antialiasing surface as pixel diffs.
 *
 * Stability:
 *   - Fixed class "cat" everywhere → deterministic label color (fiftyone
 *     hashes label strings to colors).
 *   - Mouse moved off-canvas before each snapshot (see
 *     `SampleCanvasAsserter.hasScreenshot`).
 *   - AI test right-clicks to finalize the keypoint session before
 *     snapshotting so the indefinite ripple animation isn't captured
 *     mid-cycle.
 *   - Merge test pre-seeds two adjacent mask detections via Python so the
 *     merge operates on a known starting state — independent of the brush
 *     or pen flow.
 *
 * Baselines are generated with `yarn playwright test --update-snapshots`
 * on the first run and should be captured on the platform CI runs against
 * (linux/Chromium) to avoid drift between local and CI.
 */

import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const SAMPLE_ID = "000000000000000000000000";

const schema: Record<string, unknown> = {
  type: "detections",
  classes: ["cat"],
  attributes: [],
  component: "dropdown",
};

const test = base.extend<{
  modal: ModalPom;
  datasetName: string;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  // Fresh dataset per test. Uses the test title so each baseline is
  // colocated with its corresponding dataset's render.
  datasetName: async ({ annotateSDK, datasetFactory }, use, testInfo) => {
    const name = getUniqueDatasetNameWithPrefix(
      `seg-snap-${testInfo.title.replace(/\s+/g, "-")}`,
    );

    await datasetFactory.createDataset({
      datasetName: name,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
      schema: { instances: "Detections" },
    });

    await annotateSDK.updateLabelSchema(name, "instances", schema);
    await annotateSDK.addFieldToActiveLabelSchema(name, "instances");

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
  await modal.sidebar.annotate.segmentationMode();
  await modal.sidebar.annotate.assert.segmentationModeIsActive();
};

test.describe.serial("segmentation tool snapshots", () => {
  test("pen", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Pen");

    const persist = modal.sidebar.annotate.waitForPatch();

    // Rectangle polygon centered on the canvas
    await modal.sampleCanvas.click(0.4, 0.4);
    await modal.sampleCanvas.click(0.6, 0.4);
    await modal.sampleCanvas.click(0.6, 0.6);
    await modal.sampleCanvas.click(0.4, 0.6);
    await modal.sampleCanvas.rightClick(0.5, 0.5);

    await persist;

    await modal.sampleCanvas.assert.hasScreenshot("seg-pen-rectangle.png");
  });

  test("brush", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Brush");

    const persist = modal.sidebar.annotate.waitForPatch();

    // Single diagonal stroke. drag() generates intermediate moves so the
    // brush dabs continuously instead of only at the endpoints.
    await modal.sampleCanvas.drag(0.35, 0.4, 0.65, 0.6);

    await persist;

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

    const persist = modal.sidebar.annotate.waitForPatch();

    // One positive point near the center; mock worker returns a
    // deterministic 8x8 all-foreground mask at bbox {0.4, 0.4, 0.2, 0.2}.
    await modal.sampleCanvas.click(0.5, 0.5);

    await persist;

    // Right-click to finalize the AI session: destroys the keypoint
    // overlay (and its ripple animation), leaving only the mask render.
    await modal.sampleCanvas.rightClick(0.5, 0.5);

    await modal.sampleCanvas.assert.hasScreenshot("seg-ai-mask.png");
  });

  test("merge", async ({
    annotateSDK,
    datasetFactory,
    datasetName,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // Pre-seed two adjacent mask detections so the merge test operates on a
    // known starting state — independent of the brush/pen flows.
    await datasetFactory.seedDetections({
      datasetName,
      field: "instances",
      detections: [
        { label: "cat", boundingBox: [0.25, 0.4, 0.2, 0.2], maskSize: 50 },
        { label: "cat", boundingBox: [0.55, 0.4, 0.2, 0.2], maskSize: 50 },
      ],
    });
    // Annotate the freshly-saved sample.
    void annotateSDK; // unused — kept so per-test fixture creation still runs

    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Merge");

    const persist = modal.sidebar.annotate.waitForPatch();

    // Click the first detection to set as merge target, then the second
    // detection to merge into the target.
    await modal.sampleCanvas.click(0.35, 0.5);
    await modal.sampleCanvas.click(0.65, 0.5);

    await persist;

    await modal.sampleCanvas.assert.hasScreenshot("seg-merge-union.png");

    // Sanity check: the merge collapsed the pair into a single detection.
    const state = await annotateSDK.getDetectionsState(
      datasetName,
      "instances",
    );
    expect(state.count).toBe(1);
    expect(state.maskPixels).toBeGreaterThan(0);
  });
});
