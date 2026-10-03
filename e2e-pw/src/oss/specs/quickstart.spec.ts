import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { createQuickstartDataset } from "./quickstart-data";

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

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await createQuickstartDataset(datasetFactory, datasetName, {
    patches: 'dataset.to_patches("predictions")',
    "grouped-patches":
      'dataset.to_patches("predictions").group_by("predictions.label")',
  });
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

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldDropdown("id");
    });
    await sidebar.asserter.assertFilterIsVisible("id", "categorical");

    await modal.afterSampleLoaded(() => grid.openFirstSample());

    grid.url.assert.verifySampleId(
      await modal.sidebar.getSidebarEntryText("id"),
    );
    await grid.url.back();
    grid.url.assert.verifySampleId(null);
    await modal.assert.isClosed();

    // id filter should still be open
    await sidebar.asserter.assertFilterIsVisible("id", "categorical");
  });

  test("selection bookmark", async ({ grid }) => {
    await grid.toggleSelectFirstSample();
    await grid.actionsRow.assert.hasFiltersBookmark();
    await grid.afterEntryCounts(() =>
      grid.run(async () => {
        await grid.actionsRow.bookmarkFilters();
      }),
    );
    await grid.assert.isEntryCountTextEqualTo("1 sample");
  });

  test("entry counts text when toPatches then groupedBy", async ({
    grid,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "patches" }),
    });
    // one patch per prediction, one group per distinct prediction label
    await grid.assert.isEntryCountTextEqualTo("16 patches");

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "grouped-patches" }),
    });

    await grid.assert.isEntryCountTextEqualTo("13 groups of patches");
  });

  test("sidebar persistence", async ({ grid, modal, sidebar }) => {
    await sidebar.toggleSidebarGroup("PRIMITIVES");
    await grid.openFirstSample();
    await modal.close();
    await sidebar.asserter.assertSidebarGroupIsHidden("PRIMITIVES");
  });
});
