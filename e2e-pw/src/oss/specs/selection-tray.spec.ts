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
  tray: async ({ page }, use) => use(new SelectionTrayPom(page)),
  viewBar: async ({ page }, use) => use(new ViewBarPom(page)),
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
    await tray.assert.targetsAllResults();

    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(2);
    await tray.assert.selectedSamples(2);
    await tray.assert.cardsHaveNames(["0.png", "2.png"]);

    await grid.openNthSample(1);
    await modal.toggleSelection();
    await modal.assert.verifySelectionCount(3);
    await modal.close();
    await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

    await tray.clear();
    await tray.assert.targetsAllResults();
    await tray.undo();
    await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

    await fiftyoneLoader.selectDatasetFromSelector(page, otherName);
    await grid.assert.isEntryCountTextEqualTo("1 sample");
    await tray.assert.targetsAllResults();
    await expect(tray.cards).toHaveCount(0);
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
  await grid.run(() => editor.commit("limit"));
  await grid.assert.isEntryCountTextEqualTo("60 samples");
  await expect
    .poll(() => grid.locator.getByTestId("looker").count())
    .toBeLessThan(60);
  await tray.assert.targetsAllResults();

  const name = "First sixty";
  await tray.createSubset(name);
  await tray.openCreatedSubset();
  await tray.assert.subsetScope(name, 60);
  await grid.assert.isEntryCountTextEqualTo("60 samples");

  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshTray = new SelectionTrayPom(freshPage);
    await freshTray.chooseSubset(name);
    await freshTray.assert.subsetScope(name, 60);
    await expect(freshPage.getByTestId("entry-counts")).toContainText(
      "60 samples",
    );
    await freshTray.chooseAllSamples();
    await expect(freshPage.getByTestId("entry-counts")).toContainText(
      "80 samples",
    );
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
  await grid.toggleSelectNthSample(0);
  await grid.toggleSelectNthSample(2);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  const editor = await viewBar.addStage("Skip");
  await editor.fill("skip", "1");
  await grid.run(() => editor.commit("skip"));
  await grid.assert.isEntryCountTextEqualTo("7 samples");
  await tray.assert.outsideResults(1);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  await tray.tagSamples("captured");
  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
    const freshSidebar = new SidebarPom(freshPage);
    await freshGrid.assert.isEntryCountTextEqualTo("8 samples");
    await freshSidebar.clickFieldCheckbox("tags");
    await expect(
      freshGrid.getNthTile(0).getByTestId("tag-tags-captured"),
    ).toBeVisible();
    await expect(
      freshGrid.getNthTile(1).getByTestId("tag-tags-captured"),
    ).toHaveCount(0);
    await expect(
      freshGrid.getNthTile(2).getByTestId("tag-tags-captured"),
    ).toBeVisible();
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
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.toggleSelectNthSample(0);
  await grid.toggleSelectNthSample(2);
  await tray.createSubset("Review set (v2)");
  await tray.openCreatedSubset();
  await tray.assert.subsetScope("Review set (v2)", 2);
  await grid.assert.isEntryCountTextEqualTo("2 samples");

  await grid.toggleSelectNthSample(0);
  await tray.removeSelectedFromSubset();
  await tray.assert.subsetScope("Review set (v2)", 1);
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await grid.toggleSelectNthSample(0);
  await tray.assert.cardsHaveNames(["2.png"]);

  await tray.chooseAllSamples();
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.assert.targetsAllResults();
  await expect(tray.cards).toHaveCount(0);
  await grid.toggleSelectNthSample(4);
  await tray.addToSubset("Review set (v2)");
  await tray.openCreatedSubset();
  await tray.assert.subsetScope("Review set (v2)", 2);
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await grid.toggleSelectNthSample(0);
  await grid.toggleSelectNthSample(1);
  await tray.assert.cardsHaveNames(["2.png", "4.png"]);

  await tray.deleteSubset("Review set (v2)");
  await tray.assert.targetsAllResults();
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.openScope();
  await expect(
    page.getByRole("group", { name: "Subsets" }),
  ).not.toHaveAttribute("aria-busy", "true");
  await expect(page.getByText("No saved subsets yet")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review set (v2)" }),
  ).toHaveCount(0);
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
  await grid.toggleSelectNthSample(0);
  await tray.addBucket();
  await grid.addNthSampleToBucket(2, "Bucket 2");
  await expect(tray.bucketCard("Bucket 1", "0.png")).toBeVisible();
  await expect(tray.bucketCard("Bucket 2", "2.png")).toBeVisible();

  await tray.targetBucket("Bucket 2");
  await tray.tagSamples("second-bucket");
  await tray.clearBucket("Bucket 1");
  await expect(tray.bucket("Bucket 1").getByRole("article")).toHaveCount(0);
  await expect(tray.bucketCard("Bucket 2", "2.png")).toBeVisible();
  await tray.undo();
  await expect(tray.bucketCard("Bucket 1", "0.png")).toBeVisible();
  await expect(tray.bucketCard("Bucket 2", "2.png")).toBeVisible();

  const context = await browser.newContext();
  try {
    const freshPage = await context.newPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
    const sidebar = new SidebarPom(freshPage);
    await sidebar.clickFieldCheckbox("tags");
    await expect(
      freshGrid.getNthTile(0).getByTestId("tag-tags-second-bucket"),
    ).toHaveCount(0);
    await expect(
      freshGrid.getNthTile(2).getByTestId("tag-tags-second-bucket"),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
