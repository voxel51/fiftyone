import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

// Labels match the first 5 samples of the cifar10 test split, preserved when
// migrating away from loadZooDataset (zoo datasets are a bad test pattern:
// slow, network-dependent, and couple tests to external data).
const LABELS = ["cat", "ship", "ship", "airplane", "frog"];

const datasetName = getUniqueDatasetNameWithPrefix("classification-5");

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

  await datasetFactory.createDataset({
    datasetName,
    numSamples: 5,
    numbered: true,
    schema: { ground_truth: "Classification" },
    withSampleData: ({ index }) => ({
      ground_truth: { label: LABELS[index] },
    }),
  });
});

test.describe.serial("classification-sidebar-filter-visibility", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("In classification grid, setting visibility directly works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await eventUtils.after("animation-onRest", () =>
      sidebar.clickFieldDropdown("ground_truth"),
    );
    await grid.afterTilesDrawn(5, () =>
      sidebar.applyLabelFromList(["cat"], "show-label"),
    );
    await grid.assert.hasScreenshot("visible-cat.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(5, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );
    await grid.assert.hasScreenshot("not-visible-cat.png");
  });

  test("In classification grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await eventUtils.after("animation-onRest", () =>
      sidebar.clickFieldDropdown("ground_truth"),
    );
    await sidebar.applyLabelFromList(["frog"], "show-samples-with-label");

    await grid.afterEntryCounts(() =>
      grid.afterTilesDrawn(3, () =>
        sidebar.applyLabelFromList(["ship"], "show-samples-with-label"),
      ),
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("3 of 5 samples");
    await grid.assert.hasScreenshot("show-frog.png");

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(3, () =>
      sidebar.applyLabelFromList(["frog"], "show-label"),
    );
    await grid.assert.hasScreenshot("show-frog-ship-visible-frog.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(3, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );
    await grid.assert.hasScreenshot("show-frog-ship-invisible-frog.png");
  });

  test("In classification grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    await eventUtils.after("animation-onRest", () =>
      sidebar.clickFieldDropdown("ground_truth"),
    );

    await grid.afterTilesDrawn(3, () =>
      sidebar.applyLabelFromList(["ship"], "omit-samples-with-label"),
    );

    await grid.assert.hasScreenshot("hide-ship.png");

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(3, () =>
      sidebar.applyLabelFromList(["cat"], "show-label"),
    );
    await grid.assert.hasScreenshot("hide-ship-visible-cat.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(3, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );
    await grid.assert.hasScreenshot("hide-ship-invisible-cat.png");
  });
});
