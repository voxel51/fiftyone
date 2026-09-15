import { test as base } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { GridPanelPom } from "src/oss/poms/panels/grid-panel";
import { HistogramPom } from "src/oss/poms/panels/histogram-panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  actionsRow: GridActionsRowPom;
  histogram: HistogramPom;
  panel: GridPanelPom;
}>({
  actionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
  histogram: async ({ page, eventUtils }, use) => {
    await use(new HistogramPom(page, eventUtils));
  },
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("display-options-groups");

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createGroupDataset({
    datasetName,
    numGroups: 4,
    slices: [
      { name: "left", mediaType: "image" },
      { name: "right", mediaType: "image" },
      { name: "pcd", mediaType: "point-cloud" },
    ],
  });
});

test.describe.serial("Display Options", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("switching display options statistics to group should be successful when histogram is open", async ({
    actionsRow,
    histogram,
    panel,
  }) => {
    await panel.open("Histograms");
    await panel.bringPanelToForeground("Samples");
    await actionsRow.toggleDisplayOptions();
    const histogramLoaded = await histogram.armLoad();
    await actionsRow.displayActions.setSidebarStatisticsMode("group");
    await panel.bringPanelToForeground("Histograms");
    await histogramLoaded.received;

    await histogram.assert.isLoaded();
    await panel.bringPanelToForeground("Samples");
  });
});
