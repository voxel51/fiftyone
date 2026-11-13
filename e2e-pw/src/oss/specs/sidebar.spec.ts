import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import { createDetectionsDataset } from "./detections-data";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-detections");

const LABEL_PATH = "ground_truth.detections.label";

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await createDetectionsDataset(datasetFactory, datasetName);
});

test.describe.serial("sidebar-filter-visibility", () => {
  test.beforeEach(
    async ({ page, fiftyoneLoader, grid, sidebar, eventUtils }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await page.click('[title="TAGS"]');
      await page.click('[title="METADATA"]');

      await grid.afterTilesUpdated(() =>
        sidebar.clickFieldCheckbox("predictions"),
      );
      await grid.assert.hasTileScreenshots("ground-truth-only", 5);

      await eventUtils.after("animation-onRest", () =>
        sidebar.clickFieldDropdown("ground_truth"),
      );

      // selecting a value filters in the default mode, selecting labels
      await grid.afterEntryCounts(() =>
        grid.afterGridRefreshed(() => sidebar.applyFilter("bottle")),
      );
      await grid.assert.hasTileScreenshots("bottle-filter", 1);
      await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");
      await grid.assert.isTileCountEqualTo(1);
      expect(await sidebar.filterModeText(LABEL_PATH)).toBe(
        "Select detections with label",
      );
    },
  );

  const toVisibilityMode = async (
    sidebar: SidebarPom,
    eventUtils: EventUtils,
  ) => {
    await eventUtils.after("e2e:sidebar:mode-shown", () =>
      sidebar.toggleSidebarMode(),
    );
    expect(await sidebar.getActiveMode()).toBe("VISIBILITY");
  };

  test("In grid, select a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await toVisibilityMode(sidebar, eventUtils);

    // selecting a value shows only the selected values' labels
    await grid.afterTilesUpdated(() => sidebar.applyFilter("cat"));
    await grid.assert.hasTileScreenshots("select-a-label-1", 1);
    expect(await sidebar.filterModeText(LABEL_PATH)).toBe("Show label");
    await grid.afterTilesUpdated(() => sidebar.applyFilter("person"));
    await grid.assert.hasTileScreenshots("select-a-label-2", 1);

    await grid.afterTilesUpdated(() =>
      sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
    );
    await grid.assert.hasTileScreenshots("select-a-label-3", 1);
  });

  test("In grid, exclude a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await grid.afterEntryCounts(() =>
      grid.afterGridRefreshed(() =>
        sidebar.selectFilterMode(LABEL_PATH, "exclude-detections-with-label"),
      ),
    );
    await grid.assert.hasTileScreenshots("exclude-a-label-1", 5);
    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await grid.assert.isTileCountEqualTo(5);

    await toVisibilityMode(sidebar, eventUtils);

    await grid.afterTilesUpdated(() => sidebar.applyFilter("cup"));
    await grid.assert.hasTileScreenshots("exclude-a-label-2", 5);

    await grid.afterTilesUpdated(() =>
      sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
    );
    await grid.assert.hasTileScreenshots("exclude-a-label-3", 5);
  });

  test("In grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await grid.afterGridRefreshed(() =>
      sidebar.selectFilterMode(LABEL_PATH, "show-samples-with-label"),
    );
    await grid.assert.hasTileScreenshots("show-samples-with-a-label-1", 1);
    // the bottle filter already showed these counts, so they do not signal
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");
    await grid.assert.isTileCountEqualTo(1);

    await toVisibilityMode(sidebar, eventUtils);

    await grid.afterTilesUpdated(() => sidebar.applyFilter("cup"));
    await grid.assert.hasTileScreenshots("show-samples-with-a-label-2", 1);

    await grid.afterTilesUpdated(() =>
      sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
    );
    await grid.assert.hasTileScreenshots("show-samples-with-a-label-3", 1);
  });

  test("In grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await grid.afterEntryCounts(() =>
      grid.afterGridRefreshed(() =>
        sidebar.selectFilterMode(LABEL_PATH, "omit-samples-with-label"),
      ),
    );
    await grid.assert.hasTileScreenshots("omit-samples-with-a-label-1", 4);
    await grid.assert.isEntryCountTextEqualTo("4 of 5 samples");
    await grid.assert.isTileCountEqualTo(4);

    await toVisibilityMode(sidebar, eventUtils);

    await grid.afterTilesUpdated(() => sidebar.applyFilter("horse"));
    await grid.assert.hasTileScreenshots("omit-samples-with-a-label-2", 4);

    await grid.afterTilesUpdated(() =>
      sidebar.selectFilterMode(LABEL_PATH, "hide-label"),
    );
    await grid.assert.hasTileScreenshots("omit-samples-with-a-label-3", 4);
  });
});
