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
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("In cifar grid, setting visibility directly works", async ({
    grid,
    sidebar,
  }) => {
    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.clickFieldDropdown("ground_truth");
    await grid.delay(3000);

    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["truck"],
      "show-label--------"
    );
    await grid.delay(3000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "visible-truck.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.delay(2000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "not-visible-truck.png",
      { animations: "allow" }
    );
  });

  test("In cifar grid, show samples with a label filter works", async ({
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await grid.delay(1000);
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["frog", "deer"],
      "show-samples-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("3 of 10 samples");
    await grid.waitForGridToLoad();
    await grid.delay(3000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog-deer.png",
      { animations: "allow" }
    );

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["frog"],
      "show-label--------"
    );
    await grid.delay(2000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog-deer-visible-frog.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.delay(2000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-frog-deer-invisible-frog.png",
      { animations: "allow" }
    );
  });

  test("In cifar grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await grid.delay(2000);
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["frog"],
      "omit-samples-with-label"
    );

    await grid.delay(2000);
    await grid.waitForGridToLoad();
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-frog.png",
      { animations: "allow" }
    );

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["truck"],
      "show-label--------"
    );
    await grid.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-frog-visible-truck.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.delay(2000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-frog-invisible-truck.png",
      { animations: "allow" }
    );
  });
});
