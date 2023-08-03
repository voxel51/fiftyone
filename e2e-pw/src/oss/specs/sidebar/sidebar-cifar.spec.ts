import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("cifar");

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
    await fiftyoneLoader.loadZooDataset("cifar", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test("In grid, setting visibility directly works", async ({
    grid,
    sidebar,
  }) => {
    // Test the visibility mode:
    await sidebar.toggleSidebarMode();
    // verify that visibility mode is active
    expect(sidebar.getActiveMode()).toBe("VISIBILITY");

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["visible-cattle"],
      "show-label--------"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "visible-cattle.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "not-visible-cattle.png",
      { animations: "allow" }
    );
  });

  test("In grid, show samples with a label filter works", async ({
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["cattle", "boy"],
      "show-samples-with-label"
    );
    // await sidebar.applyLabelFromList(
    //     "ground_truth.detections.label",
    //     ["boy"],
    //     "show-samples-with-label"
    //   );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("2 of 5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-cattle-boy.png",
      { animations: "allow" }
    );

    // Test with visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["cattle"],
      "show-label--------"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-cattle-boy-visible-cattle.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "show-cattle-boy-invisible-cattle.png",
      { animations: "allow" }
    );
  });

  test("In grid, omit samples with a label filter works", async ({
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["cattle", "boy"],
      "omit-samples-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("3 of 5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-cattle-boy.png",
      { animations: "allow" }
    );

    // Test the visibility mode:
    await sidebar.toggleSidebarMode();

    // test case: visibility mode - show label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      ["apple"],
      "show-label--------"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-cattle-boy-visible-apple.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList(
      "ground_truth.detections.label",
      [],
      "hide-label"
    );
    await grid.assert.delay(1000);
    await expect(await grid.getNthFlashlightSection(0)).toHaveScreenshot(
      "hide-cattle-boy-invisible-apple.png",
      { animations: "allow" }
    );
  });
});
