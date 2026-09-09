import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

// 14 predictions over 8 distinct labels
const PREDICTIONS = [
  ["bird", "bird", "person"],
  ["cat", "dog", "person", "car"],
  ["dog", "dog"],
  ["car", "truck", "bus"],
  ["bird", "boat"],
];

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
  await datasetFactory.createDetectionsDataset({
    datasetName,
    numbered: true,
    schema: { uniqueness: "FloatField" },
    samples: PREDICTIONS.map((labels, index) => ({
      detections: {
        predictions: labels.map((label) => ({ label, confidence: 0.9 })),
      },
      fields: { uniqueness: 0.7 + index / 100 },
    })),
    savedViews: {
      patches: 'dataset.to_patches("predictions")',
      "grouped-patches":
        'dataset.to_patches("predictions").group_by("predictions.label")',
    },
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

    const expanded = await eventUtils.arm("animation-onRest");
    await sidebar.clickFieldDropdown("id");
    await expanded.received;
    await sidebar.asserter.assertFilterIsVisible("id", "categorical");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();

    grid.url.assert.verifySampleId(
      await modal.sidebar.getSidebarEntryText("id"),
    );
    await grid.url.back();
    grid.url.assert.verifySampleId(null);
    await modal.assert.isClosed();

    // id filter should still be open
    await sidebar.asserter.assertFilterIsVisible("id", "categorical");
  });

  test("selection bookmark", async ({ page, grid }) => {
    await grid.toggleSelectFirstSample();
    await grid.actionsRow.assert.hasFiltersBookmark();
    const gridRefresh = await grid.armGridRefresh();
    await grid.actionsRow.bookmarkFilters();
    await gridRefresh.received;
    await expect(page.getByTestId("entry-counts")).toHaveText("1 sample");
  });

  test("entry counts text when toPatches then groupedBy", async ({
    grid,
    fiftyoneLoader,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "patches" }),
    });
    await grid.assert.isEntryCountTextEqualTo("14 patches");

    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "grouped-patches" }),
    });

    await grid.assert.isEntryCountTextEqualTo("8 groups of patches");
  });

  test("sidebar persistence", async ({ grid, modal, sidebar }) => {
    await sidebar.toggleSidebarGroup("PRIMITIVES");
    await grid.openFirstSample();
    await modal.close();
    await sidebar.asserter.assertSidebarGroupIsHidden("PRIMITIVES");
  });
});
