import { test as base } from "src/oss/fixtures";
import { PanelPom } from "src/oss/poms/panel";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

const test = base.extend<{
  actionsRow: GridActionsRowPom;
  panel: PanelPom;
}>({
  actionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
  panel: async ({ page }, use) => {
    await use(new PanelPom(page));
  },
});

test.describe("Display Options", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart-groups", datasetName, {
      max_samples: 12,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("switching display options statistics to group should be successful when histogram is open", async ({
    actionsRow,
    panel,
  }) => {
    await panel.openNew();
    await panel.open();
    await actionsRow.openDisplayOptions();
    await actionsRow.displayActions.setSidebarStatisticsMode("group");
    await panel.open("histograms");

    await panel.distributionContainer().waitFor({ state: "visible" });
    await panel.distributionContainer().click();

    await panel.assert.histogramLoaded();
  });
});
