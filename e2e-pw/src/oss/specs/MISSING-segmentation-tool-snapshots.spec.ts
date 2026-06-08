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
import { SAM2_MOCK_WORKER_SRC } from "src/shared/sam2-mock-worker";
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
  datasetName: async (
    { annotateSDK, datasetFactory },
    use,
    testInfo
  ) => {
    const name = getUniqueDatasetNameWithPrefix(
      `seg-snap-${testInfo.title.replace(/\s+/g, "-")}`
    );

    await datasetFactory.createBlankDataset({
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

const waitForPatch = (page: import("@playwright/test").Page) =>
  page.waitForResponse(
    (resp) =>
      resp.request().method() === "PATCH" &&
      /\/dataset\/[^/]+\/sample\//.test(resp.url()) &&
      resp.status() < 400,
    { timeout: 30_000 }
  );

const openAnnotate = async (
  modal: ModalPom,
  page: import("@playwright/test").Page,
  fiftyoneLoader: import("src/shared/abstract-loader").AbstractFiftyoneLoader,
  datasetName: string
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

    const persist = waitForPatch(page);

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

    const persist = waitForPatch(page);

    // Single diagonal stroke. drag() generates intermediate moves so the
    // brush dabs continuously instead of only at the endpoints.
    await modal.sampleCanvas.drag(0.35, 0.4, 0.65, 0.6);

    await persist;

    await modal.sampleCanvas.assert.hasScreenshot("seg-brush-stroke.png");
  });

  test("ai", async ({ datasetName, fiftyoneLoader, modal, page }) => {
    // Install the deterministic mock SAM2 worker BEFORE the page mounts
    // BrowserAnnotationProvider. See `app/.../BrowserAnnotationProvider.ts`
    // for the seam contract.
    await page.addInitScript((workerSrc: string) => {
      (
        window as unknown as { __FO_TEST_SAM2_WORKER_FACTORY?: () => Worker }
      ).__FO_TEST_SAM2_WORKER_FACTORY = () => {
        const blob = new Blob([workerSrc], { type: "text/javascript" });
        return new Worker(URL.createObjectURL(blob));
      };
    }, SAM2_MOCK_WORKER_SRC);

    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("AI");

    const persist = waitForPatch(page);

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
    datasetName,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // Pre-seed two adjacent mask detections so the merge test operates on a
    // known starting state — independent of the brush/pen flows.
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      import numpy as np

      dataset = fo.load_dataset("${datasetName}")
      sample = dataset.first()

      mask = np.ones((50, 50), dtype=bool)
      det_a = fo.Detection(
        label="cat", bounding_box=[0.25, 0.4, 0.2, 0.2], mask=mask
      )
      det_b = fo.Detection(
        label="cat", bounding_box=[0.55, 0.4, 0.2, 0.2], mask=mask
      )
      sample["instances"] = fo.Detections(detections=[det_a, det_b])
      sample.save()
    `);
    // Annotate the freshly-saved sample.
    void annotateSDK; // unused — kept so per-test fixture creation still runs

    await openAnnotate(modal, page, fiftyoneLoader, datasetName);
    await modal.sidebar.annotate.pickTool("Merge");

    const persist = waitForPatch(page);

    // Click the first detection to set as merge target, then the second
    // detection to merge into the target.
    await modal.sampleCanvas.click(0.35, 0.5);
    await modal.sampleCanvas.click(0.65, 0.5);

    await persist;

    await modal.sampleCanvas.assert.hasScreenshot("seg-merge-union.png");

    // Sanity check: the merge collapsed the pair into a single detection.
    const state = await annotateSDK.getDetectionsState(
      datasetName,
      "instances"
    );
    expect(state.count).toBe(1);
    expect(state.maskPixels).toBeGreaterThan(0);
  });
});
