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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset_name = "${datasetName}"
    dataset = foz.load_zoo_dataset(
      "quickstart", max_samples=5, dataset_name=dataset_name
    )
    dataset.persistent = True

    patches = dataset.to_patches("predictions")
    dataset.save_view("patches", patches)

    grouped_patches = patches.group_by("predictions.label")
    dataset.save_view("grouped-patches", grouped_patches)
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("quickstart", () => {
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

  test("entry counts text when toPatches then groupedBy", async ({
    grid,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "patches" }),
    });
    await grid.assert.isEntryCountTextEqualTo("122 patches");

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "grouped-patches" }),
    });

    await grid.assert.isEntryCountTextEqualTo("33 groups of patches");
  });

  test("selection bookmark", async ({ page, grid }) => {
    await grid.toggleSelectFirstSample();
    await grid.actionsRow.assert.hasFiltersBookmark();
    const gridRefresh = grid.getWaitForGridRefreshPromise();
    await grid.actionsRow.bookmarkFilters();
    await gridRefresh;
    await expect(page.getByTestId("entry-counts")).toHaveText(
      "1 group of patch"
    );
  });

  test("sidebar persistence", async ({ grid, modal, sidebar }) => {
    await sidebar.toggleSidebarGroup("PRIMITIVES");
    await grid.openFirstSample();
    await modal.close();
    await sidebar.asserter.assertSidebarGroupIsHidden("PRIMITIVES");
  });
});
