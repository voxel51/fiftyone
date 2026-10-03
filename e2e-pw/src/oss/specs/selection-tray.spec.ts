import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { SidebarPom } from "src/oss/poms/sidebar";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";

const test = base.extend<{
  datasetName: string;
  grid: GridPom;
  modal: ModalPom;
  tray: SelectionTrayPom;
  viewBar: ViewBarPom;
  sidebar: SidebarPom;
}>({
  datasetName: async ({ datasetFactory, fiftyoneLoader }, use, testInfo) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-tray");
    await datasetFactory.createDataset({
      datasetName,
      numSamples: testInfo.title.includes("offscreen") ? 80 : 8,
      numbered: true,
    });
    try {
      await use(datasetName);
    } finally {
      await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")
`);
    }
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
  sidebar: async ({ page }, use) => use(new SidebarPom(page)),
});

test.beforeAll(async ({ foWebServer }) => foWebServer.startWebServer());
test.afterAll(async ({ foWebServer }) => foWebServer.stopWebServer());

test("selection follows the grid and modal, and clear can be undone", async ({
  datasetFactory,
  datasetName,
  fiftyoneLoader,
  grid,
  modal,
  page,
  tray,
}) => {
  const otherName = getUniqueDatasetNameWithPrefix("selection-other");
  await datasetFactory.createDataset({
    datasetName: otherName,
    numSamples: 1,
    numbered: true,
  });
  try {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await tray.untilTray((shown) => !shown.explicit);
    await tray.assert.targetsAllResults();

    await tray.afterSelected(2, async () => {
      await grid.toggleSelectNthSample(0);
      await grid.toggleSelectNthSample(2);
    });
    await tray.assert.selectedSamples(2);
    await tray.assert.cardsHaveNames(["0.png", "2.png"]);

    await modal.afterSampleLoaded(() => grid.openNthSample(1));
    await tray.afterSelected(3, () => modal.toggleSelection());
    await modal.assert.verifySelectionCount(3);
    await modal.close();
    await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

    await tray.afterResults(() => tray.clear());
    await tray.assert.targetsAllResults();
    await tray.afterSelected(3, () => tray.undo());
    await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

    await grid.afterEntryCounts(() =>
      tray.afterResults(
        () => fiftyoneLoader.selectDatasetFromSelector(page, otherName),
        1,
      ),
    );
    await grid.assert.isEntryCountTextEqualTo("1 sample");
    await tray.assert.targetsAllResults();
    await tray.assert.noCards();
  } finally {
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
if fo.dataset_exists("${otherName}"):
    fo.delete_dataset("${otherName}")
`);
  }
});

test("all current results include offscreen samples in a saved subset", async ({
  browser,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "60");
  await tray.afterResults(() => grid.run(() => editor.commit("limit")), 60);
  await grid.assert.isEntryCountTextEqualTo("60 samples");
  expect(await grid.locator.getByTestId("looker").count()).toBeLessThan(60);
  await tray.assert.targetsAllResults();

  const name = "First sixty";
  await tray.createSubset(name);
  await grid.run(() => tray.openCreatedSubset(name, "60 samples"));
  await tray.assert.subsetScope(name, 60);
  await grid.assert.isEntryCountTextEqualTo("60 samples");

  // View stages are shared through the server session, including with a new
  // browser context. Clear Limit before checking the dataset-wide scope.
  await grid.run(() => viewBar.removeStage(0));
  await grid.assert.isEntryCountTextEqualTo("60 samples");

  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshEvents = new EventUtils(freshPage);
    const freshGrid = new GridPom(freshPage, freshEvents);
    const freshTray = new SelectionTrayPom(freshPage, freshEvents);
    await freshGrid.run(() =>
      freshTray.chooseSubset(name, undefined, "60 samples"),
    );
    await freshTray.assert.subsetScope(name, 60);
    await freshGrid.assert.isEntryCountTextEqualTo("60 samples");
    await freshGrid.run(() => freshTray.chooseAllSamples());
    await freshGrid.assert.isEntryCountTextEqualTo("80 samples");
  } finally {
    await context.close();
  }
});

test("captured samples remain action targets outside the current results", async ({
  browser,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSelected(2, async () => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(2);
  });
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  const editor = await viewBar.addStage("Skip");
  await editor.fill("skip", "1");
  await tray.afterTray(
    (shown) => shown.explicit && shown.outside === 1,
    () => grid.run(() => editor.commit("skip")),
  );
  await grid.assert.isEntryCountTextEqualTo("7 samples");
  await tray.assert.outsideResults(1);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  // tagging refreshes the grid
  await grid.run(() => tray.tagSamples("captured"));
  await grid.run(() => viewBar.removeStage(0));
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
    const freshSidebar = new SidebarPom(freshPage);
    await freshGrid.assert.isEntryCountTextEqualTo("8 samples");
    await freshGrid.afterTagsRenderedNamed(["0.png", "1.png", "2.png"], () =>
      freshSidebar.clickFieldCheckbox("tags"),
    );
    const captured = (n: number) =>
      freshGrid.getNthTile(n).getByTestId("tag-tags-captured");
    expect(await captured(0).isVisible()).toBe(true);
    expect(await captured(1).count()).toBe(0);
    expect(await captured(2).isVisible()).toBe(true);
  } finally {
    await context.close();
  }
});

test("a saved subset can gain and lose members and be deleted", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  const name = "Review set (v2)";
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSelected(2, async () => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(2);
  });
  await tray.createSubset(name);
  await grid.run(() => tray.openCreatedSubset(name, "2 samples"));
  await tray.assert.subsetScope(name, 2);
  await grid.assert.isEntryCountTextEqualTo("2 samples");

  await tray.afterSelected(1, () => grid.toggleSelectNthSample(0));
  await grid.run(() =>
    tray.afterScope({ label: name, count: "1 sample" }, () =>
      tray.removeSelectedFromSubset(),
    ),
  );
  await tray.assert.subsetScope(name, 1);
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await tray.afterSelected(1, () => grid.toggleSelectNthSample(0));
  await tray.assert.cardsHaveNames(["2.png"]);

  await grid.run(() => tray.afterResults(() => tray.chooseAllSamples(), 8));
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.assert.targetsAllResults();
  await tray.assert.noCards();
  await tray.afterSelected(1, () => grid.toggleSelectNthSample(4));
  await tray.addToSubset(name);
  await grid.run(() => tray.openCreatedSubset(name, "2 samples"));
  await tray.assert.subsetScope(name, 2);
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await tray.afterSelected(2, async () => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(1);
  });
  await tray.assert.cardsHaveNames(["2.png", "4.png"]);

  await grid.run(() =>
    tray.afterResults(
      () =>
        tray.afterScope({ label: "All samples" }, () =>
          tray.deleteSubset(name),
        ),
      8,
    ),
  );
  await tray.assert.targetsAllResults();
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.openScope(0);
  const subsets = page.getByRole("group", { name: "Subsets" });
  expect(await subsets.getAttribute("aria-busy")).toBeNull();
  expect(await page.getByText("No saved subsets yet").isVisible()).toBe(true);
  expect(await page.getByRole("button", { name }).count()).toBe(0);
});

test("buckets keep separate targets through tagging, clear, and undo", async ({
  browser,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSelected(1, () => grid.toggleSelectNthSample(0));
  await tray.addBucket();
  await tray.afterBuckets("1,1", () =>
    grid.addNthSampleToBucket(2, "Bucket 2"),
  );
  const shown = async (bucket: string, fileName: string) =>
    expect(await tray.bucketCard(bucket, fileName).isVisible()).toBe(true);
  await shown("Bucket 1", "0.png");
  await shown("Bucket 2", "2.png");

  await tray.targetBucket("Bucket 2");
  await grid.run(() => tray.tagSamples("second-bucket"));
  await tray.afterBuckets("0,1", () => tray.clearBucket("Bucket 1"));
  expect(await tray.bucket("Bucket 1").getByRole("article").count()).toBe(0);
  await shown("Bucket 2", "2.png");
  await tray.afterBuckets("1,1", () => tray.undo());
  await shown("Bucket 1", "0.png");
  await shown("Bucket 2", "2.png");

  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
    const sidebar = new SidebarPom(freshPage);
    await freshGrid.afterTagsRenderedNamed(["0.png", "2.png"], () =>
      sidebar.clickFieldCheckbox("tags"),
    );
    const tagged = (n: number) =>
      freshGrid.getNthTile(n).getByTestId("tag-tags-second-bucket");
    expect(await tagged(0).count()).toBe(0);
    expect(await tagged(2).isVisible()).toBe(true);
  } finally {
    await context.close();
  }
});
