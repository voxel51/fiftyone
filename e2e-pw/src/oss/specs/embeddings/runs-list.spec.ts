/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The embeddings panel's runs list: what each run's card says, moving between
 * the list and a plot, and deleting a run.
 */
import { test as base } from "src/oss/fixtures";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { EmbeddingsV2Pom } from "src/oss/poms/panels/embeddings-v2-panel";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { BRAIN_KEY, plantedPoint, TOTAL, twoClusters } from "./seed";

const BRAIN_KEY_3D = "viz3d";

/** The run the e2e plugin's "E2E: Compute visualization" operator writes */
const LATE_BRAIN_KEY = "e2e_late_viz";

const test = base.extend<{
  datasetName: string;
  embeddings: EmbeddingsV2Pom;
  operatorsBrowser: OperatorsBrowserPom;
}>({
  // A dataset per test: the server keeps ONE session, and a page opened on
  // the same dataset inherits its layout and open run
  datasetName: async ({ datasetFactory }, use) => {
    const name = getUniqueDatasetNameWithPrefix("embeddings-runs");
    await datasetFactory.createDataset({
      datasetName: name,
      ...twoClusters,
      visualizations: [
        ...twoClusters.visualizations,
        {
          brainKey: BRAIN_KEY_3D,
          points: (index) => [...plantedPoint(index), index % 3],
        },
      ],
    });
    await use(name);
  },
  embeddings: async ({ eventUtils, page }, use) => {
    await use(new EmbeddingsV2Pom(page, eventUtils));
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

test("each run's card shows its dimensions, status, and source", async ({
  datasetName,
  embeddings,
  fiftyoneLoader,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await embeddings.open();

  await embeddings.assert.hasRunCount(2);
  await embeddings.assert.runCardShows(BRAIN_KEY, [
    "2D",
    "Ready",
    "samples",
    "pre-computed embeddings (MANUAL)",
  ]);
  await embeddings.assert.runCardShows(BRAIN_KEY_3D, ["3D", "Ready"]);
});

test("back returns from a plot to the runs list", async ({
  datasetName,
  embeddings,
  fiftyoneLoader,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await embeddings.open();
  await embeddings.openRun(BRAIN_KEY, TOTAL);

  await embeddings.back();

  await embeddings.assert.hasRunCount(2);
});

test("deleting a run removes its card", async ({
  datasetFactory,
  embeddings,
  fiftyoneLoader,
  page,
}) => {
  const deleteDatasetName = getUniqueDatasetNameWithPrefix(
    "embeddings-runs-delete",
  );
  await datasetFactory.createDataset({
    datasetName: deleteDatasetName,
    ...twoClusters,
    visualizations: [
      { brainKey: "keep", points: plantedPoint },
      { brainKey: "doomed", points: plantedPoint },
    ],
  });

  await fiftyoneLoader.waitUntilGridVisible(page, deleteDatasetName);
  await embeddings.open();
  await embeddings.assert.hasRunCount(2);

  await embeddings.deleteRun("doomed");

  await embeddings.assert.hasNoRun("doomed");
  await embeddings.assert.hasRunCount(1);
  await embeddings.assert.runCardShows("keep", ["Ready"]);
});

test("a run computed after the page loaded appears when the panel opens", async ({
  datasetName,
  embeddings,
  fiftyoneLoader,
  operatorsBrowser,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

  // The run registers server-side while the page holds its loaded run list.
  // The operator executes synchronously, so its response means the run exists
  const executed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/operators/execute",
  );
  await operatorsBrowser.show();
  await operatorsBrowser.search("E2E");
  await operatorsBrowser.choose("E2E: Compute visualization");
  await executed;

  await embeddings.open();

  await embeddings.assert.hasRunCount(3);
  await embeddings.assert.runCardShows(LATE_BRAIN_KEY, ["Ready"]);
});

test("a dataset with no runs opens the panel without crashing", async ({
  datasetFactory,
  embeddings,
  fiftyoneLoader,
  page,
}) => {
  const noRunsDatasetName =
    getUniqueDatasetNameWithPrefix("embeddings-no-runs");
  await datasetFactory.createDataset({ datasetName: noRunsDatasetName });

  await fiftyoneLoader.waitUntilGridVisible(page, noRunsDatasetName);
  await embeddings.open();

  // The no-runs page differs by edition (an upsell landing in OSS, a neutral
  // empty state in Enterprise), so only its presence is asserted
  await embeddings.assert.verifyPanelLoaded();
});
