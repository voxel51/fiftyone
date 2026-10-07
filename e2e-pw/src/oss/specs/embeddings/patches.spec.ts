/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The embeddings panel on a patches run — one point per detection — beside
 * an image dataset's samples grid.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { EmbeddingsV2Pom } from "src/oss/poms/panels/embeddings-v2-panel";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import {
  BRAIN_KEY,
  type ImageSeed,
  LEFT_HALF,
  PAIR_PATCHES,
  PAIR_SAMPLES,
  PATCH_A,
  PATCH_TOTAL,
  patchClusters,
  PATCHES_BRAIN_KEY,
  PATCHES_VIEW,
  PROBE,
  PROBE_FILE,
  probePatches,
  twoPatchesEach,
} from "./seed";

const LABEL_PATH = "ground_truth.detections.label";

const test = base.extend<{
  /** The dataset each test gets; override per describe with `test.use` */
  seed: ImageSeed;
  datasetName: string;
  embeddings: EmbeddingsV2Pom;
  grid: GridPom;
  operatorsBrowser: OperatorsBrowserPom;
}>({
  seed: [patchClusters, { option: true }],
  // A dataset per test: the server keeps ONE session, and a page opened on
  // the same dataset inherits its layout, filters, and open run
  datasetName: async ({ datasetFactory, seed }, use) => {
    const name = getUniqueDatasetNameWithPrefix("embeddings-patches");
    await datasetFactory.createDataset({ datasetName: name, ...seed });
    await use(name);
  },
  embeddings: async ({ eventUtils, page }, use) => {
    await use(new EmbeddingsV2Pom(page, eventUtils));
  },
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  operatorsBrowser: async ({ page }, use) => {
    await use(new OperatorsBrowserPom(page));
  },
});

// A blocked action (say, an overlay over a button) fails in seconds instead
// of retrying until the whole test times out
test.use({ actionTimeout: Duration.Seconds(10) });

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("on two clusters of patches", () => {
  test.beforeEach(async ({ datasetName, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("the run card says it embeds patches", async ({ embeddings }) => {
    await embeddings.open();

    await embeddings.assert.runCardShows(BRAIN_KEY, ["ground_truth patches"]);
  });

  test("a lasso scopes the grid to the samples owning the patches", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, PATCH_TOTAL);
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);

    // The chip counts samples only when it can know them; a patches lasso
    // compiles to label ids, so it counts the selected points instead
    await embeddings.assert.hasSelectionChip(`${PATCH_A} selected`);
    await grid.assert.isEntryCountTextEqualTo(`${PATCH_A} samples`);
  });

  test("a legend click hides one class's patches", async ({ embeddings }) => {
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, PATCH_TOTAL);
    await embeddings.colorBy(LABEL_PATH);
    await embeddings.toggleLegend("dog");

    await embeddings.assert.legendRowIsOff("dog");
    await embeddings.assert.hasCounter(
      `${PATCH_TOTAL} points · ${PATCH_A} in view`,
    );
  });
});

test.describe("across samples and patches", () => {
  test.use({ seed: twoPatchesEach });

  test("selecting a patch in a patches grid lights its sample's point", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    grid,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: PATCHES_VIEW }),
    });
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, PAIR_SAMPLES);

    await embeddings.afterEmphasisDrawn(1, () => grid.toggleSelectNthSample(0));

    await embeddings.assert.hasScreenshot("patch-lights-its-sample.png");
  });

  test("selecting a sample lights every one of its patches", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    grid,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(PATCHES_BRAIN_KEY, PAIR_PATCHES);

    await embeddings.afterEmphasisDrawn(2, () => grid.toggleSelectNthSample(0));

    await embeddings.assert.hasScreenshot("sample-lights-its-patches.png");
  });

  test("another panel's sample selection lights those samples' patches", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    operatorsBrowser,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    // Selected before the split: at full width the grid's action row
    // keeps its operators button clear of the sort-by input
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    await operatorsBrowser.choose("E2E: Set extended selection");
    await embeddings.openInSplit();

    // three samples, two patches each
    await embeddings.afterEmphasisDrawn(6, () =>
      embeddings.openRun(PATCHES_BRAIN_KEY, PAIR_PATCHES),
    );

    await embeddings.assert.hasScreenshot("another-panels-patches.png");
  });

  test("a samples run can color by a label-list path", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, PAIR_SAMPLES);

    await embeddings.colorBy("ground_truth.detections.label");

    // A list collapses to its first element per point: every sample's
    // first detection is a "cat"
    await embeddings.assert.legendRowCounts("cat", String(PAIR_SAMPLES));
  });
});

test.describe("on a probe patch at the canvas center", () => {
  test.use({ seed: probePatches });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, 3);
  });

  test("hovering a patch crops the card to its box", async ({ embeddings }) => {
    await embeddings.hover(PROBE.x, PROBE.y);

    await embeddings.assert.hasHoverCard(PROBE_FILE);
    await embeddings.assert.hoverCardIsCropped();
  });
});
