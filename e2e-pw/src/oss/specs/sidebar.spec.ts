import { test as base, expect } from "src/oss/fixtures";
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

    const entryExpandPromise = await eventUtils.arm("animation-onRest");
    // select bottle in ground_truth.detections.label
    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise.received;
    await sidebar.applyLabelFromList(
      ["bottle"],
      "select-detections-with-label",
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "select-bottle.png",
      { animations: "allow" },
    );

    // go to visibility mode
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(["cat"], "show-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "select-bottle-show-cat.png",
      { animations: "allow" },
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(["person"], "hide-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "select-bottle-hide-person-cat.png",
      { animations: "allow" },
    );
  });

  test("In grid, exclude a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    const entryExpandPromise = await eventUtils.arm("animation-onRest");

    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise.received;
    await sidebar.applyLabelFromList(
      ["bottle"],
      "exclude-detections-with-label",
    );

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await grid.waitForGridToLoad();
    await grid.assert.isTileCountEqualTo(5);
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "exclude-bottle.png",
      { animations: "allow" },
    );

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(["cup"], "show-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "exclude-bottle-show-cup.png",
      { animations: "allow" },
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "exclude-bottle-hide-cup.png",
      { animations: "allow" },
    );
  });

  test("In grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    const entryExpandPromise = await eventUtils.arm("animation-onRest");

    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise.received;

    const gridRefreshPromise = await grid.armGridRefresh();
    await sidebar.applyLabelFromList(["bottle"], "show-samples-with-label");

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("1 of 5 samples");
    await gridRefreshPromise.received;

    await expect(grid.getForwardSection()).toHaveScreenshot("show-bottle.png", {
      animations: "allow",
    });

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(["cup"], "show-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "show-bottle-show-cup.png",
      { animations: "allow" },
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "show-bottle-hide-cup.png",
      { animations: "allow" },
    );
  });

  test("In grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // only show ground_truth (on by default), hide predictions
    await sidebar.clickFieldCheckbox("predictions");

    const entryExpandPromise = await eventUtils.arm("animation-onRest");

    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise.received;
    await sidebar.applyLabelFromList(["bottle"], "omit-samples-with-label");

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("4 of 5 samples");
    await grid.waitForGridToLoad();

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "hide-bottle.png",
      { animations: "allow" },
    );

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(["horse"], "show-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "hide-bottle-show-horse.png",
      { animations: "allow" },
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "hide-bottle-hide-horse.png",
      { animations: "allow" },
    );
  });
});
