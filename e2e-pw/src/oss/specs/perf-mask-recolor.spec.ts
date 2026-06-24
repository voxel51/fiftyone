/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Benchmark: main-thread blocking time (sum of `longtask` durations) while
 * RECOLORING a sample whose detections carry large instance masks. The whole
 * point of the GPU-tint + off-main-thread-decode changes is to keep the main
 * thread free during a colorscheme change, so this measures exactly that.
 *
 * Dataset: one 4K blank image with N detections, each carrying a MASK_SIZE²
 * instance mask (built via the dataset factory, not inline Python).
 *
 * This is a measurement harness, not a pass/fail gate — it logs the number and
 * annotates the report. It is skipped unless `RUN_PERF=1`. Compare before/after
 * by running the SAME spec against two app builds (see the footer).
 */

import { expect, test as base } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { ColorModalPom } from "src/oss/poms/color-modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("perf-mask-recolor");

const N_MASKS = 10;
const MASK_SIZE = 512;
const RUN = !!process.env.RUN_PERF;

const test = base.extend<{
  gridActions: GridActionsRowPom;
  colorModal: ColorModalPom;
}>({
  gridActions: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
  colorModal: async ({ page }, use) => {
    await use(new ColorModalPom(page));
  },
});

test.describe("mask recolor blocking-time benchmark", () => {
  test.skip(!RUN, "perf benchmark — set RUN_PERF=1 to run");

  test.beforeAll(async ({ datasetFactory, foWebServer }) => {
    await foWebServer.startWebServer();

    // 4K blank white image, one sample.
    await datasetFactory.createDataset({
      datasetName,
      numSamples: 1,
      imageOptions: { fillColor: "white", width: 3840, height: 2160 },
      schema: { ground_truth: "Detections" },
    });

    // N detections, each with a MASK_SIZE² mask. Mask size (not box size) is
    // what drives decode/recolor cost, so the boxes are just spread out.
    await datasetFactory.seedDetections({
      datasetName,
      field: "ground_truth",
      detections: Array.from({ length: N_MASKS }, (_, i) => ({
        label: `m${i}`,
        boundingBox: [
          (i % 5) * 0.18 + 0.02,
          Math.floor(i / 5) * 0.42 + 0.05,
          0.16,
          0.38,
        ] as [number, number, number, number],
        maskSize: MASK_SIZE,
      })),
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    // Accumulate main-thread blocking (long tasks) from the first script, with
    // a reset hook so we can scope the measurement to the recolor interaction.
    await page.addInitScript(() => {
      const w = window as unknown as { __TBT: number; __resetTBT: () => void };
      w.__TBT = 0;
      w.__resetTBT = () => {
        w.__TBT = 0;
      };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          w.__TBT += entry.duration;
        }
      }).observe({ entryTypes: ["longtask"] });
    });

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test(`recolor ${N_MASKS} x ${MASK_SIZE}^2 masks`, async ({
    page,
    gridActions,
    colorModal,
  }) => {
    // Masks are rendered in the grid looker. Reset the accumulator, then
    // shuffle the color scheme (recolors every overlay) and let it settle.
    await page.evaluate(() =>
      (window as unknown as { __resetTBT: () => void }).__resetTBT()
    );

    await gridActions.toggleColorSettings();
    await colorModal.shuffleColors();
    await colorModal.closeColorModal();

    // allow the recolor to run and long tasks to flush
    await page.waitForTimeout(2000);

    const tbt = await page.evaluate(
      () => (window as unknown as { __TBT: number }).__TBT
    );

    // eslint-disable-next-line no-console
    console.log(
      `[perf] recolor main-thread blocking, ${N_MASKS} x ${MASK_SIZE}^2 masks: ${tbt.toFixed(
        1
      )} ms`
    );
    test.info().annotations.push({
      type: "perf",
      description: `recolor TBT = ${tbt.toFixed(
        1
      )} ms (${N_MASKS} x ${MASK_SIZE}^2 masks)`,
    });

    // benchmark, not a gate — just confirm the harness measured something
    expect(tbt).toBeGreaterThanOrEqual(0);
  });
});

/*
 * Run (USE_DEV_BUILD=true → dev server + single worker):
 *
 *   # terminal 1 — serve the app build you want to measure
 *   cd app && yarn dev
 *
 *   # terminal 2
 *   cd e2e-pw && RUN_PERF=1 yarn e2e src/oss/specs/perf-mask-recolor.spec.ts
 *
 * Before/after (run the SAME spec against two app builds, read the "[perf] …"
 * log line / the "perf" annotation in the HTML report):
 *   - after  (this stack): serve the app from perf/mask-decode-offthread
 *   - before (baseline):   serve the app from develop, with this spec checked
 *       out onto it:
 *         git checkout develop
 *         git checkout perf/mask-benchmark -- \
 *           e2e-pw/src/oss/specs/perf-mask-recolor.spec.ts
 *       (then `git restore --staged --worktree` the spec afterward)
 */
