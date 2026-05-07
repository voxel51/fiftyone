import { test as base, expect } from "src/oss/fixtures";
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

  await datasetFactory.createBlankDataset({
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
    await sidebar.applyLabelFromList(["cat"], "show-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "visible-cat.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "not-visible-cat.png",
      { animations: "allow" }
    );
  });

  test("In classification grid, show samples with a label filter works", async ({
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
    await sidebar.waitForElement("checkbox-frog");
    await sidebar.waitForElement("checkbox-ship");
    await sidebar.applyLabelFromList(["frog"], "show-samples-with-label");

    await sidebar.applyLabelFromList(["ship"], "show-samples-with-label");

    // verify the number of samples in the result
    await grid.assert.isEntryCountTextEqualTo("3 of 5 samples");
    await expect(await grid.getForwardSection()).toHaveScreenshot(
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
    await sidebar.applyLabelFromList(["frog"], "show-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "show-frog-ship-visible-frog.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "show-frog-ship-invisible-frog.png",
      { animations: "allow" }
    );
  });

  test("In classification grid, omit samples with a label filter works", async ({
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

    await sidebar.applyLabelFromList(["ship"], "omit-samples-with-label");

    await expect(await grid.getForwardSection()).toHaveScreenshot(
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
    await sidebar.applyLabelFromList(["cat"], "show-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "hide-ship-visible-cat.png",
      { animations: "allow" }
    );

    // test case: visibility mode - hide label
    await sidebar.applyLabelFromList([], "hide-label");
    await gridRefreshedEventPromise;
    await expect(await grid.getForwardSection()).toHaveScreenshot(
      "hide-ship-invisible-cat.png",
      { animations: "allow" }
    );
  });
});
