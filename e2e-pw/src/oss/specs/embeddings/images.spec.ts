/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The embeddings panel on an image dataset: round trips between the plot,
 * the server, and the grid.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { OperatorsBrowserPom } from "src/oss/poms/operators/operators-browser";
import { EmbeddingsV2Pom } from "src/oss/poms/panels/embeddings-v2-panel";
import { SidebarPom } from "src/oss/poms/sidebar";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import {
  BRAIN_KEY,
  CLUSTER_A,
  CLUSTER_B,
  EMPTY_AREA,
  type ImageSeed,
  LEFT_HALF,
  MIRRORED_BRAIN_KEY,
  mirroredPoint,
  PLOT_WORKSPACE,
  plotWorkspace,
  PROBE,
  PROBE_FILE,
  probeLine,
  RIGHT_HALF,
  STALE_WORKSPACE,
  staleWorkspace,
  TABS_WORKSPACE,
  tabsWorkspace,
  TOTAL,
  twoClusters,
} from "./seed";

/** A saved view holding only cluster `a` */
const LEFT_VIEW = "left-cluster";

const test = base.extend<{
  /** The dataset each test gets; override per describe with `test.use` */
  seed: ImageSeed;
  datasetName: string;
  embeddings: EmbeddingsV2Pom;
  grid: GridPom;
  operatorsBrowser: OperatorsBrowserPom;
  sidebar: SidebarPom;
}>({
  seed: [twoClusters, { option: true }],
  // A dataset per test: the server keeps ONE session, and a page opened on
  // the same dataset inherits it — layout, filters, selection, the open run.
  // Opening a different dataset resets all of it.
  datasetName: async ({ datasetFactory, seed }, use) => {
    const name = getUniqueDatasetNameWithPrefix("embeddings-images");
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
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
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

test.describe("on the whole dataset", () => {
  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, TOTAL);
  });

  test("a lasso scopes the grid to the points it encloses", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);

    // A selection narrows the grid's total itself (extended stages feed
    // every count), so the header reads "25 samples", not a filter's
    // "25 of 40"
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);

    await embeddings.clearSelection();

    await embeddings.assert.hasNoSelection();
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("a background click clears the selection", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    await embeddings.clickCanvas(EMPTY_AREA.x, EMPTY_AREA.y);

    await embeddings.assert.hasNoSelection();
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("closing the panel releases the grid from its selection", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);

    await embeddings.gridPanel.closeTab("Embeddings");

    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("selecting samples in the grid highlights them in the plot", async ({
    embeddings,
    grid,
  }) => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(1);
    await grid.toggleSelectNthSample(2);

    await embeddings.assert.hasCounter(`3 selected · ${TOTAL} points`);
    await embeddings.assert.hasSelectionChip("3 samples");
  });

  test("a legend click filters the grid through the sidebar", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.colorBy("cluster");
    await embeddings.toggleLegend("b");

    await embeddings.assert.legendRowIsOff("b");
    await embeddings.assert.hasCounter(
      `${TOTAL} points · ${CLUSTER_A} in view`,
    );
    await grid.assert.isEntryCountTextEqualTo(
      `${CLUSTER_A} of ${TOTAL} samples`,
    );
  });

  test("a legend double-click isolates a class, and a second restores all", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.colorBy("cluster");

    await embeddings.isolateLegend("b");
    await embeddings.assert.legendRowIsOff("a");
    await grid.assert.isEntryCountTextEqualTo(
      `${CLUSTER_B} of ${TOTAL} samples`,
    );

    await embeddings.isolateLegend("b");
    await embeddings.assert.legendRowIsOff("a", false);
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("a sidebar filter scopes the plot", async ({
    embeddings,
    eventUtils,
    sidebar,
  }) => {
    const expanded = await eventUtils.arm("animation-onRest");
    await sidebar.clickFieldDropdown("cluster");
    await expanded.received;
    await sidebar.applyFilter("a");

    await embeddings.assert.hasCounter(
      `${TOTAL} points · ${CLUSTER_A} in view`,
    );
  });

  test("legend counts follow a lasso", async ({ embeddings }) => {
    await embeddings.colorBy("cluster");
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);

    await embeddings.assert.legendRowCounts("a", `${CLUSTER_A} / ${CLUSTER_A}`);
    await embeddings.assert.legendRowCounts("b", `0 / ${CLUSTER_B}`);
  });

  test("a numeric color-by draws a continuous legend", async ({
    embeddings,
  }) => {
    await embeddings.colorBy("score");

    await embeddings.assert.hasContinuousLegend();
    await expect(embeddings.legendRow("a")).toBeHidden();
  });

  test("background clicks clear the selection, then the legend filter", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.colorBy("cluster");
    await embeddings.toggleLegend("b");
    await embeddings.assert.legendRowIsOff("b");
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    // The topmost layer comes off first: the selection, not the filter
    await embeddings.clickCanvas(EMPTY_AREA.x, EMPTY_AREA.y);
    await embeddings.assert.hasNoSelection();
    await embeddings.assert.legendRowIsOff("b");

    await embeddings.clickCanvas(EMPTY_AREA.x, EMPTY_AREA.y);
    await embeddings.assert.legendRowIsOff("b", false);
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("the clear button resets the legend filter and the selection", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.colorBy("cluster");
    await embeddings.toggleLegend("b");
    await embeddings.assert.legendRowIsOff("b");
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    await embeddings.clearFiltersAndSelection();

    await embeddings.assert.hasNoSelection();
    await embeddings.assert.legendRowIsOff("b", false);
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);
  });

  test("opening a run resets its color-by", async ({ embeddings }) => {
    await embeddings.colorBy("cluster");
    await embeddings.assert.isColoredBy("cluster");

    await embeddings.back();
    await embeddings.openRun(BRAIN_KEY, TOTAL);

    await embeddings.assert.isColoredBy("None");
  });

  test("a fresh page load restores the open run and color-by", async ({
    browser,
    datasetName,
    embeddings,
    fiftyoneLoader,
  }) => {
    await embeddings.colorBy("cluster");
    await embeddings.assert.isColoredBy("cluster");

    // A new browser context shares no client state with this one: what it
    // shows came back from the server's session
    const context = await browser.newContext();
    try {
      const freshPage = await context.newPage();
      await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
      const fresh = new EmbeddingsV2Pom(freshPage, new EventUtils(freshPage));

      await fresh.assert.hasDrawn(TOTAL);
      await fresh.assert.isColoredBy("cluster");
    } finally {
      await context.close();
    }
  });

  test("the plot draws its clusters in their legend colors", async ({
    embeddings,
  }) => {
    await embeddings.colorBy("cluster");
    await embeddings.assert.legendRowIsOff("a", false);

    await embeddings.assert.hasScreenshot("two-clusters-by-cluster.png");
  });
});

test.describe("after another panel selects samples", () => {
  test.beforeEach(
    async ({
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
      // The run opens onto the other panel's 3 samples, lit
      await embeddings.afterEmphasisDrawn(3, () =>
        embeddings.openRun(BRAIN_KEY, TOTAL),
      );
    },
  );

  test("the grid narrows and the plot highlights the selection", async ({
    embeddings,
    grid,
  }) => {
    await grid.assert.isEntryCountTextEqualTo("3 samples");
    // Focus, not scope: the plot highlights the selection and hides nothing
    await embeddings.assert.hasScreenshot("another-panels-three.png");
    await embeddings.assert.hasDrawn(TOTAL);
  });

  test("the plot's own lasso outranks the other panel's selection", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.assert.hasScreenshot("another-panels-three.png");

    await embeddings.setMode("select");
    await embeddings.afterEmphasisDrawn(CLUSTER_A, () =>
      embeddings.lasso(LEFT_HALF),
    );

    // The grid shows the lasso INSTEAD of the foreign selection, so the
    // plot must light the lasso's points, not the foreign ones
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);
    await embeddings.assert.hasScreenshot("left-cluster-lassoed.png");
  });
});

test.describe("in tabs beside the grid", () => {
  test.use({
    seed: { ...twoClusters, workspaces: { [TABS_WORKSPACE]: tabsWorkspace } },
  });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ workspace: TABS_WORKSPACE }),
    });
    await embeddings.assert.hasDrawn(TOTAL);
  });

  test("switching tabs keeps the grid narrowed", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    await embeddings.gridPanel.bringPanelToForeground("Histograms");

    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);
  });
});

test.describe("on a wide screen", () => {
  // At 1280 px a half-width grid lets its sort-by input cover the bookmark
  test.use({ viewport: { width: 1920, height: 1080 } });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, TOTAL);
  });

  test("a lasso committed as a view stage outlives the panel", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    // The bookmark turns the draft selection into a real view stage
    await grid.actionsRow.bookmarkFilters();
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);

    // Closing the panel clears selections, never the view
    await embeddings.gridPanel.closeTab("Embeddings");
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);
  });

  test("a view change clears the lasso", async ({
    embeddings,
    grid,
    operatorsBrowser,
  }) => {
    // Cluster b, so the view below (the first 3 samples, all in cluster a)
    // shares no sample with the lasso: a stage left behind would empty the
    // grid instead of showing the view's 3
    await embeddings.setMode("select");
    await embeddings.lasso(RIGHT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_B} samples`);

    // The e2e plugin's operator sets a `limit(3)` view
    await operatorsBrowser.show();
    await operatorsBrowser.search("E2E");
    const cleared = await embeddings.armEmphasisDrawn(null);
    await operatorsBrowser.choose("E2E: Set view");

    await grid.assert.isEntryCountTextEqualTo("3 samples");
    await embeddings.assert.hasNoSelection();
    // "in view" shows only once no selection outranks it in the counter
    await embeddings.assert.hasCounter(`${TOTAL} points · 3 in view`);
    // The view's 3 points, none of them lit
    await cleared.received;
    await embeddings.assert.hasScreenshot("view-of-three.png");
  });
});

test.describe("from a saved workspace", () => {
  test.use({
    seed: {
      ...twoClusters,
      workspaces: {
        [PLOT_WORKSPACE]: plotWorkspace,
        [STALE_WORKSPACE]: staleWorkspace,
      },
    },
  });

  test("the panel reopens the workspace's run and color-by", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ workspace: PLOT_WORKSPACE }),
    });

    await embeddings.assert.hasDrawn(TOTAL);
    await embeddings.assert.isColoredBy("cluster");
    await embeddings.assert.legendRowIsOff("a", false);
    await embeddings.assert.legendRowIsOff("b", false);
  });

  test("a workspace naming a missing run falls back to the runs list", async ({
    datasetName,
    embeddings,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ workspace: STALE_WORKSPACE }),
    });

    await embeddings.assert.runCardShows(BRAIN_KEY, ["Ready"]);
  });
});

test.describe("with two runs", () => {
  test.use({
    seed: {
      ...twoClusters,
      visualizations: [
        ...twoClusters.visualizations,
        { brainKey: MIRRORED_BRAIN_KEY, points: mirroredPoint },
      ],
    },
  });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, TOTAL);
  });

  test("going back to the runs list clears the lasso", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.lasso(LEFT_HALF);
    await embeddings.assert.hasSelectionChip(`${CLUSTER_A} samples`);

    // The list shows no selection, so the grid must not keep one either
    await embeddings.back();
    await grid.assert.isEntryCountTextEqualTo(`${TOTAL} samples`);

    await embeddings.openRun(MIRRORED_BRAIN_KEY, TOTAL);
    await embeddings.assert.hasNoSelection();
  });
});

test.describe("on a probe point at the canvas center", () => {
  test.use({ seed: probeLine });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, 3);
  });

  test("hovering a point shows its sample", async ({ embeddings }) => {
    await embeddings.hover(PROBE.x, PROBE.y);

    await embeddings.assert.hasHoverCard(PROBE_FILE);
  });

  test("clicking a point scopes the grid to its sample", async ({
    embeddings,
    grid,
  }) => {
    await embeddings.setMode("select");
    await embeddings.afterEmphasisDrawn(1, () =>
      embeddings.clickCanvas(PROBE.x, PROBE.y),
    );

    await embeddings.assert.hasSelectionChip("1 sample");
    await embeddings.assert.hasScreenshot("probe-clicked.png");
    await grid.assert.isEntryCountTextEqualTo("1 sample");
  });
});

test.describe("under a saved view", () => {
  test.use({
    seed: {
      ...twoClusters,
      savedViews: { [LEFT_VIEW]: 'dataset.match(F("cluster") == "a")' },
    },
  });

  test.beforeEach(async ({ datasetName, embeddings, fiftyoneLoader, page }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: LEFT_VIEW }),
    });
    await embeddings.openInSplit();
    await embeddings.openRun(BRAIN_KEY, TOTAL);
  });

  test("the plot hides points outside the view", async ({
    embeddings,
    grid,
  }) => {
    await grid.assert.isEntryCountTextEqualTo(`${CLUSTER_A} samples`);
    await embeddings.assert.hasCounter(
      `${TOTAL} points · ${CLUSTER_A} in view`,
    );
  });
});
