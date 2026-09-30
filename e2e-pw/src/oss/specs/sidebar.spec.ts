import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
    max_samples: 5,
  });
});

test.describe.serial("sidebar-filter-visibility", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    // always fold tags and metaData groups
    await page.click('[title="TAGS"]');
    await page.click('[title="METADATA"]');
  });

  test("In grid, select a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    await eventUtils.after("animation-onRest", async () => {
      // select bottle in ground_truth.detections.label
      await sidebar.clickFieldDropdown("ground_truth");
    });
    await grid.afterEntryCounts(() =>
      grid.afterTilesDrawn(1, () =>
        sidebar.applyLabelFromList(["bottle"], "select-detections-with-label"),
      ),
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");

    await grid.assert.hasScreenshot("select-bottle.png");

    // go to visibility mode
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(1, () =>
      sidebar.applyLabelFromList(["cat"], "show-label"),
    );

    await grid.assert.hasScreenshot("select-bottle-show-cat.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(1, () =>
      sidebar.applyLabelFromList(["person"], "hide-label"),
    );

    await grid.assert.hasScreenshot("select-bottle-hide-person-cat.png");
  });

  test("In grid, exclude a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldDropdown("ground_truth");
    });
    await grid.afterEntryCounts(() =>
      grid.afterTilesDrawn(5, () =>
        sidebar.applyLabelFromList(["bottle"], "exclude-detections-with-label"),
      ),
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await grid.assert.isTileCountEqualTo(5);
    await grid.assert.hasScreenshot("exclude-bottle.png");

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(5, () =>
      sidebar.applyLabelFromList(["cup"], "show-label"),
    );

    await grid.assert.hasScreenshot("exclude-bottle-show-cup.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(5, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );

    await grid.assert.hasScreenshot("exclude-bottle-hide-cup.png");
  });

  test("In grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldDropdown("ground_truth");
    });

    await grid.afterEntryCounts(() =>
      grid.afterTilesDrawn(1, () =>
        grid.run(() =>
          sidebar.applyLabelFromList(["bottle"], "show-samples-with-label"),
        ),
      ),
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");

    await grid.assert.hasScreenshot("show-bottle.png");

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(1, () =>
      sidebar.applyLabelFromList(["cup"], "show-label"),
    );

    await grid.assert.hasScreenshot("show-bottle-show-cup.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(1, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );

    await grid.assert.hasScreenshot("show-bottle-hide-cup.png");
  });

  test("In grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    await eventUtils.after("animation-onRest", async () => {
      await sidebar.clickFieldDropdown("ground_truth");
    });
    await grid.afterEntryCounts(() =>
      grid.afterTilesDrawn(4, () =>
        sidebar.applyLabelFromList(["bottle"], "omit-samples-with-label"),
      ),
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("4 of 5 samples");

    await grid.assert.hasScreenshot("hide-bottle.png");

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await grid.afterTilesDrawn(4, () =>
      sidebar.applyLabelFromList(["horse"], "show-label"),
    );

    await grid.assert.hasScreenshot("hide-bottle-show-horse.png");

    // test case: visibility mode - hide label
    await grid.afterTilesDrawn(4, () =>
      sidebar.applyLabelFromList([], "hide-label"),
    );

    await grid.assert.hasScreenshot("hide-bottle-hide-horse.png");
  });
});
