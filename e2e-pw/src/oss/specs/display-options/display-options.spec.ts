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
  actionsRow: async ({ page, eventUtils }, use) => {
    await use(new GridActionsRowPom(page, eventUtils));
  },
  histogram: async ({ page, eventUtils }, use) => {
    await use(new HistogramPom(page, eventUtils));
  },
  panel: async ({ page }, use) => {
    await use(new GridPanelPom(page));
  },
});

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.loadZooDataset("quickstart-groups", datasetName, {
    max_samples: 12,
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
    await actionsRow.displayActions.setSidebarStatisticsMode("group");
    await actionsRow.toggleDisplayOptions();
    await panel.bringPanelToForeground("Histograms");

    await histogram.assert.isLoaded();
    await panel.bringPanelToForeground("Samples");
  });
});
