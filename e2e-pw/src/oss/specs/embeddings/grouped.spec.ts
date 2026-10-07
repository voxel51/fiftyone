/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The embeddings panel on a group dataset, with one run over each of two
 * image slices.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { EmbeddingsV2Pom } from "src/oss/poms/panels/embeddings-v2-panel";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import {
  BRAIN_KEY,
  GROUP_A,
  groupClusters,
  GROUPS,
  LEFT_HALF,
  RIGHT_BRAIN_KEY,
} from "./seed";

const test = base.extend<{
  datasetName: string;
  embeddings: EmbeddingsV2Pom;
  grid: GridPom;
}>({
  // A dataset per test: the server keeps ONE session, and a page opened on
  // the same dataset inherits its layout, slice, and open run
  datasetName: async ({ datasetFactory }, use) => {
    const name = getUniqueDatasetNameWithPrefix("embeddings-grouped");
    await datasetFactory.createDataset({ datasetName: name, ...groupClusters });
    await use(name);
  },
  embeddings: async ({ eventUtils, page }, use) => {
    await use(new EmbeddingsV2Pom(page, eventUtils));
  },
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
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

test.beforeEach(async ({ datasetName, fiftyoneLoader, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test("a lasso on the default slice scopes the grid", async ({
  embeddings,
  grid,
}) => {
  await embeddings.openInSplit();
  await embeddings.openRun(BRAIN_KEY, GROUPS);
  await embeddings.setMode("select");
  await embeddings.lasso(LEFT_HALF);

  await embeddings.assert.hasSelectionChip(`${GROUP_A} samples`);
  await grid.assert.isEntryCountTextEqualTo(`${GROUP_A} groups with slice`);
});

// The grid stays on the default slice while the run covers another one:
// before #8632, color values came from the default slice only, so every
// point colored as missing and any filter dimmed every point
test("a run on a non-default slice colors and filters its points", async ({
  embeddings,
}) => {
  await embeddings.openInSplit();
  await embeddings.openRun(RIGHT_BRAIN_KEY, GROUPS);
  await embeddings.colorBy("cluster");
  await embeddings.assert.legendRowIsOff("a", false);

  await embeddings.toggleLegend("b");

  await embeddings.assert.legendRowIsOff("b");
  await embeddings.assert.hasCounter(`${GROUPS} points · ${GROUP_A} in view`);
});
