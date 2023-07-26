import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("smoke-quickstart");

const test = base.extend<{ sidebar: SidebarPom; grid: GridPom }>({
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  grid: async ({ page }, use) => {
    await use(new GridPom(page));
  },
});

test.describe("sidebar-filter-visibility", () => {
  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.loadZooDataset("quickstart", datasetName, {
      max_samples: 5,
    });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
    // always unfold tags and metaData groups
    await page.click('[title="TAGS"]');
    await page.click('[title="METADATA"]');
  });

  test("In grid, select a label filter works", async ({
    page,
    grid,
    sidebar,
  }) => {
    // select bottlel in ground_truth.detections.label
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.getLabelFromList(
      "ground_truth.detections.label",
      ["bottle"],
      "select-detections-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("1 of 5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.verifyNLookers(1);

    // ground_truth field count
    // take a screenshot of looker and verify

    // go to visibility mode
  });

  test("In grid, exclude a label filter works", async ({
    page,
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.getLabelFromList(
      "ground_truth.detections.label",
      ["bottle"],
      "exclude-detections-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.verifyNLookers(5);
  });

  test("In grid, show samples with a label filter works", async ({
    page,
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.getLabelFromList(
      "ground_truth.detections.label",
      ["bottle"],
      "show-samples-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("1 of 5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.verifyNLookers(1);
  });

  test("In grid, omit samples with a label filter works", async ({
    page,
    grid,
    sidebar,
  }) => {
    await sidebar.clickFieldDropdown("ground_truth");
    await sidebar.getLabelFromList(
      "ground_truth.detections.label",
      ["bottle"],
      "omit-samples-with-label"
    );

    // verify the number of samples in the result
    await grid.assert.waitForEntryCountTextToEqual("4 of 5 samples");
    await grid.assert.waitForGridToLoad();
    await grid.assert.verifyNLookers(4);
  });
});
