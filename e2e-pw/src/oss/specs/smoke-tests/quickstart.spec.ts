import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader }) => {
  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe("quickstart", () => {
  test("smoke", async ({ page, grid, modal }) => {
    await expect(page.getByTestId("entry-counts")).toHaveText("5 samples");

    // test navigation
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    // text copy text
    await modal.sidebar.getSidebarEntry("id").press(`Ctrl+KeyC`);
    modal.assert.verifySampleNavigation("forward");
  });

  test("entry counts text when toPatches then groupedBy", async ({ grid }) => {
    await grid.actionsRow.toggleToClipsOrPatches();

    const gridRefreshPromisePredictions = grid.getWaitForGridRefreshPromise();
    await grid.actionsRow.clickToPatchesByLabelField("predictions");
    await gridRefreshPromisePredictions;

    await grid.assert.isEntryCountTextEqualTo("122 patches");

    await grid.actionsRow.toggleCreateDynamicGroups();
    const gridRefreshPromiseGroupByLabel = grid.getWaitForGridRefreshPromise();
    await grid.actionsRow.groupBy("predictions.label");
    await gridRefreshPromiseGroupByLabel;

    await grid.assert.isEntryCountTextEqualTo("33 groups of patches");
  });

  test("selection bookmark", async ({ page, grid }) => {
    await grid.toggleSelectFirstSample();
    await grid.actionsRow.assert.hasFiltersBookmark();
    const gridRefresh = grid.getWaitForGridRefreshPromise();
    await grid.actionsRow.bookmarkFilters();
    await gridRefresh;
    await expect(page.getByTestId("entry-counts")).toHaveText("1 sample");
  });
});
