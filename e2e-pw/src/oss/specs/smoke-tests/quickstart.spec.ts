import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
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
  test("smoke", async ({ eventUtils, grid, modal, sidebar }) => {
    await grid.assert.isEntryCountTextEqualTo("5 samples");

    // test navigation

    const expanded = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await sidebar.clickFieldDropdown("id");
    await expanded;
    await sidebar.asserter.assertFilterIsVisibile("id", "categorical");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    grid.url.assert.verifySampleId(
      await modal.sidebar.getSidebarEntryText("id")
    );
    await grid.url.back();
    grid.url.assert.verifySampleId(null);
    await modal.assert.isClosed();

    // id filter should still be open
    await sidebar.asserter.assertFilterIsVisibile("id", "categorical");
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

  test("sidebar persistence", async ({ grid, modal, sidebar }) => {
    await sidebar.toggleSidebarGroup("PRIMITIVES");
    await grid.openFirstSample();
    await modal.close();
    await sidebar.asserter.assertSidebarGroupIsHidden("PRIMITIVES");
  });
});
