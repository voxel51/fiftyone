import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("classification-5");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
});

test.describe("classification-sidebar-filter-visibility", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("cifar10", datasetName, {
      max_samples: 5,
      split: "test",
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("In cifar grid, setting visibility directly works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    // Test the visibility mode:
    await sidebar.toggleSidebarMode();
    // mount eventListener
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "re-render-tag",
        () => true
      );
    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );

    // test case: visibility mode - show label
    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise;
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["cat"],
      "show-label--------"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "visible-cat.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "not-visible-cat.png",
      { animations: "allow" }
    );
  });

  test("In cifar grid, show samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
    page,
  }) => {
    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );

    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise;
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["frog", "ship"],
      "show-samples-with-label"
    );

    // verify the number of samples in the result
    await grid.waitForGridToLoad();
    await grid.assert.isEntryCountTextEqualTo("3 of 5 samples");

    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog.png",
      { animations: "allow" }
    );

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();
    // mount eventListener
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "re-render-tag",
        () => true
      );

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["frog"],
      "show-label--------"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog-ship-visible-frog.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog-ship-invisible-frog.png",
      { animations: "allow" }
    );
  });

  test("In cifar grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
    eventUtils,
  }) => {
    const entryExpandPromise = eventUtils.getEventReceivedPromiseForPredicate(
      "animation-onRest",
      () => true
    );
    await sidebar.clickFieldDropdown("ground_truth");
    await entryExpandPromise;

    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["ship"],
      "omit-samples-with-label"
    );

    await grid.waitForGridToLoad();
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-ship.png",
      { animations: "allow" }
    );

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // mount eventListener
    const gridRefreshedEventPromise =
      eventUtils.getEventReceivedPromiseForPredicate(
        "re-render-tag",
        () => true
      );

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["cat"],
      "show-label--------"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-ship-visible-cat.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await gridRefreshedEventPromise;
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-ship-invisible-cat.png",
      { animations: "allow" }
    );
  });
});
