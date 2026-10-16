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
}>({
  datasetName: async ({ datasetFactory }, use, testInfo) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-tray");
    await datasetFactory.createDataset({
      datasetName,
      numSamples: testInfo.title.includes("offscreen")
        ? 80
        : testInfo.title.includes("view stages")
          ? 20
          : 8,
      numbered: true,
      subsets: testInfo.title.includes("existing subset")
        ? { Existing: [] }
        : {},
    });
    await use(datasetName);
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer }) => foWebServer.startWebServer());
test.afterAll(async ({ foWebServer }) => foWebServer.stopWebServer());

/** Select the grid's tiles at `indexes`, one at a time */
const selectTiles = async (
  grid: GridPom,
  tray: SelectionTrayPom,
  indexes: readonly number[],
) => {
  for (const [count, index] of indexes.entries())
    await tray.afterSettled(() => grid.toggleSelectNthSample(index), {
      cards: count + 1,
    });
};

test("view stages: selected samples outside a new view stay in the tray", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(viewBar.page, datasetName);
  await selectTiles(grid, tray, [0, 2]);
  const selected = await tray.getSelectedSampleNames();
  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await tray.afterSettled(() => grid.run(() => editor.commit("limit")), {
    cards: 2,
    outside: 1,
  });
  await tray.assert.cardsHaveNames(selected);
  await tray.assert.outsideResults(1);
  await tray.afterSettled(() => grid.run(() => viewBar.removeStage(0)), {
    cards: 2,
  });
  await tray.assert.cardsHaveNames(selected);
  await tray.assert.selectedSamples(2);
});

for (const { name, param, value, count } of [
  { name: "Take", param: "size", value: "10", count: 2 },
  { name: "Limit", param: "limit", value: "1", count: 1 },
  { name: "Skip", param: "skip", value: "2", count: 2 },
]) {
  test(`view stages: selections survive removing ${name}`, async ({
    datasetName,
    fiftyoneLoader,
    grid,
    tray,
    viewBar,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(viewBar.page, datasetName);
    const editor = await viewBar.addStage(name);
    await editor.fill(param, value);
    await grid.run(() => editor.commit(param));
    await selectTiles(grid, tray, count === 2 ? [0, 2] : [0]);
    await tray.assert.selectedSamples(count);
    const selected = await tray.getSelectedSampleNames();

    await grid.afterEntryCounts(() => grid.run(() => viewBar.removeStage(0)));
    await grid.assert.isEntryCountTextEqualTo("20 samples");
    // the captures never change: removing the stage leaves them as they were
    await tray.assert.selectedSamples(count);
    await tray.assert.cardsHaveNames(selected);
  });
}

for (const { name, param, value, count } of [
  { name: "Take", param: "size", value: "10", count: 2 },
  { name: "Limit", param: "limit", value: "1", count: 1 },
]) {
  test(`view stages: subset created under ${name} opens and reopens`, async ({
    datasetName,
    fiftyoneLoader,
    grid,
    openFreshPage,
    page,
    tray,
    viewBar,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    const editor = await viewBar.addStage(name);
    await editor.fill(param, value);
    await grid.run(() => editor.commit(param));
    await selectTiles(grid, tray, count === 2 ? [0, 2] : [0]);
    const selected = await tray.getSelectedSampleNames();

    await tray.createSubset("Stage selection");
    // the subset opens on its members alone, without the stage that found
    // them, so the grid reloads; a Limit of one already counts its one sample
    await grid.afterGridRefreshed(() =>
      count === 2
        ? grid.afterEntryCounts(() => tray.openCreatedSubset())
        : tray.openCreatedSubset(),
    );
    await tray.assert.subsetScope("Stage selection", count);
    await tray.assert.selectedSamples(count);
    await tray.assert.cardsHaveNames(selected);

    const freshPage = await openFreshPage();
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    const freshEvents = new EventUtils(freshPage);
    const freshGrid = new GridPom(freshPage, freshEvents);
    const freshTray = new SelectionTrayPom(freshPage, freshEvents);
    await freshGrid.afterEntryCounts(() =>
      freshTray.chooseSubset("Stage selection"),
    );
    await freshTray.assert.subsetScope("Stage selection", count);
    await freshGrid.afterEntryCounts(() => freshTray.chooseAllSamples());
    await freshGrid.assert.isEntryCountTextEqualTo("20 samples");
  });
}

test("view stages: Take selections can be added to an existing subset", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  const editor = await viewBar.addStage("Take");
  await editor.fill("size", "10");
  await grid.run(() => editor.commit("size"));
  await selectTiles(grid, tray, [0, 2]);
  const selected = await tray.getSelectedSampleNames();

  await tray.addToSubset("Existing");
  // the subset opens on its members alone, without the Take that found them
  await grid.afterGridRefreshed(() =>
    grid.afterEntryCounts(() => tray.openCreatedSubset()),
  );
  await tray.assert.subsetScope("Existing", 2);
  await tray.assert.selectedSamples(2);
  await tray.assert.cardsHaveNames(selected);
});

test("selection follows the grid and modal, and clear can be undone and redone", async ({
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
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.untilSettledEmpty();
  await tray.assert.targetsAllResults();

  await selectTiles(grid, tray, [0, 2]);
  await tray.assert.selectedSamples(2);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  await grid.openNthSample(1);
  // the tray behind the modal follows the modal's selection
  await tray.afterSettled(
    async () => {
      await modal.toggleSelection();
      await modal.assert.verifySelectionCount(3);
      await modal.close();
    },
    { cards: 3 },
  );
  await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

  await tray.clear();
  await tray.assert.targetsAllResults();
  await tray.undo(3);
  await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);
  await tray.redo(0);
  await tray.assert.targetsAllResults();
  await tray.undo(3);
  await tray.assert.cardsHaveNames(["0.png", "1.png", "2.png"]);

  await tray.afterSettled(
    () =>
      grid.afterEntryCounts(() =>
        fiftyoneLoader.selectDatasetFromSelector(page, otherName),
      ),
    { cards: 0 },
  );
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await tray.assert.targetsAllResults();
  expect(await tray.cards.count()).toBe(0);
});

test("all current results include offscreen samples in a saved subset", async ({
  datasetName,
  eventUtils,
  fiftyoneLoader,
  grid,
  openFreshPage,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "60");
  await grid.afterEntryCounts(() => grid.run(() => editor.commit("limit")));
  await grid.assert.isEntryCountTextEqualTo("60 samples");
  await tray.untilSettledEmpty();
  await tray.assert.targetsAllResults();

  // nothing selected: the subset captures every result, drawn or not
  const name = "First sixty";
  await tray.createSubset(name);
  await eventUtils.after("e2e:app:page-change", () => tray.openCreatedSubset());
  await tray.assert.subsetScope(name, 60);
  // Opening a subset clears the Limit that found its members. Wait for that
  // view transition before checking persistence, rather than racing it with
  // a second removal of the outgoing stage.
  await viewBar.assert.stageCount(0);

  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
  const freshEvents = new EventUtils(freshPage);
  const freshGrid = new GridPom(freshPage, freshEvents);
  const freshTray = new SelectionTrayPom(freshPage, freshEvents);
  await freshGrid.afterEntryCounts(() => freshTray.chooseSubset(name));
  await freshTray.assert.subsetScope(name, 60);
  await freshGrid.afterEntryCounts(() => freshTray.chooseAllSamples());
  await freshGrid.assert.isEntryCountTextEqualTo("80 samples");
});

test("captured samples remain action targets outside the current results", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  openFreshPage,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await selectTiles(grid, tray, [0, 2]);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  const editor = await viewBar.addStage("Skip");
  await editor.fill("skip", "1");
  await tray.afterSettled(
    () => grid.afterEntryCounts(() => grid.run(() => editor.commit("skip"))),
    { cards: 2, outside: 1 },
  );
  await grid.assert.isEntryCountTextEqualTo("7 samples");
  await tray.assert.outsideResults(1);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);

  await tray.tagSamples("captured");
  await grid.afterEntryCounts(() => grid.run(() => viewBar.removeStage(0)));
  await grid.assert.isEntryCountTextEqualTo("8 samples");

  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
  const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
  await freshGrid.afterTagsRenderedNamed(["0.png", "1.png", "2.png"], () =>
    new SidebarPom(freshPage).clickFieldCheckbox("tags"),
  );
  const tagged = (index: number) =>
    freshGrid.getNthTile(index).getByTestId("tag-tags-captured").count();
  expect(await tagged(0)).toBe(1);
  expect(await tagged(1)).toBe(0);
  expect(await tagged(2)).toBe(1);
});

test("a saved subset can gain and lose members and be deleted", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await selectTiles(grid, tray, [0, 2]);
  await tray.createSubset("Review set (v2)");
  await grid.afterEntryCounts(() => tray.openCreatedSubset());
  await tray.assert.subsetScope("Review set (v2)", 2);
  await tray.assert.cardsHaveNames(["0.png", "2.png"]);
  await tray.clear();

  await selectTiles(grid, tray, [0]);
  await grid.afterEntryCounts(() => tray.removeSelectedFromSubset());
  await tray.assert.subsetScope("Review set (v2)", 1);
  await selectTiles(grid, tray, [0]);
  await tray.assert.cardsHaveNames(["2.png"]);

  await grid.afterEntryCounts(() => tray.chooseAllSamples());
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.assert.cardsHaveNames(["2.png"]);
  await tray.clear();
  await selectTiles(grid, tray, [4]);
  await tray.addToSubset("Review set (v2)");
  await grid.afterEntryCounts(() => tray.openCreatedSubset());
  await tray.assert.subsetScope("Review set (v2)", 2);
  await tray.clear();
  await selectTiles(grid, tray, [0, 1]);
  await tray.assert.cardsHaveNames(["2.png", "4.png"]);

  await grid.afterEntryCounts(() => tray.deleteSubset("Review set (v2)"));
  await grid.assert.isEntryCountTextEqualTo("8 samples");
  await tray.assert.cardsHaveNames(["2.png", "4.png"]);
  await tray.openScope();
  await tray.assert.listsNoSubsets();
});

test("sections keep separate targets through tagging, clear, and undo", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  openFreshPage,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await selectTiles(grid, tray, [0]);
  // the first section keeps the pick; the active second receives the next one
  await tray.split();
  await tray.activateSection("Section 2");
  await tray.afterSettled(() => grid.toggleSelectNthSample(2), { cards: 2 });
  await tray.assert.sectionHasCards("Section 1", ["0.png"]);
  await tray.assert.sectionHasCards("Section 2", ["2.png"]);

  // actions apply to the active section alone
  await tray.tagSamples("second-section");
  await tray.clearSection("Section 1", 1);
  await tray.assert.sectionHasCards("Section 1", []);
  await tray.assert.sectionHasCards("Section 2", ["2.png"]);
  await tray.undo(2);
  await tray.assert.sectionHasCards("Section 1", ["0.png"]);
  await tray.assert.sectionHasCards("Section 2", ["2.png"]);

  const freshPage = await openFreshPage();
  await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
  const freshGrid = new GridPom(freshPage, new EventUtils(freshPage));
  await freshGrid.afterTagsRenderedNamed(["0.png", "2.png"], () =>
    new SidebarPom(freshPage).clickFieldCheckbox("tags"),
  );
  const tagged = (index: number) =>
    freshGrid.getNthTile(index).getByTestId("tag-tags-second-section").count();
  expect(await tagged(0)).toBe(0);
  expect(await tagged(2)).toBe(1);
});

test("number keys sort the sample under the pointer, making sections", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  // one strip: 1 picks
  await tray.sortWithKey(grid.getNthTile(0), 1, 1);
  // 3 makes the second and third sections and sorts into the third
  await tray.sortWithKey(grid.getNthTile(1), 3, 2);
  await tray.assert.sectionHasCards("Section 1", ["0.png"]);
  await tray.assert.sectionHasCards("Section 2", []);
  await tray.assert.sectionHasCards("Section 3", ["1.png"]);
  // a sample can sit in several sections, and its number takes it back out
  await tray.sortWithKey(grid.getNthTile(1), 2, 3);
  await tray.sortWithKey(grid.getNthTile(1), 3, 2);
  await tray.assert.sectionHasCards("Section 2", ["1.png"]);
  await tray.assert.sectionHasCards("Section 3", []);
  // a tray card sorts like its tile
  await tray.sortWithKey(tray.section("Section 1").getByRole("article"), 3, 3);
  await tray.assert.sectionHasCards("Section 3", ["0.png"]);
});

test("cards drag between sections, Alt copying them", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.sortWithKey(grid.getNthTile(0), 1, 1);
  await tray.sortWithKey(grid.getNthTile(1), 2, 2);

  await tray.dragCard("0.png", "Section 1", "Section 2");
  await tray.assert.sectionHasCards("Section 1", []);
  await tray.assert.sectionHasCards("Section 2", ["1.png", "0.png"]);
  await tray.dragCard("1.png", "Section 2", "Section 1", { copy: true });
  await tray.assert.sectionHasCards("Section 1", ["1.png"]);
  await tray.assert.sectionHasCards("Section 2", ["1.png", "0.png"]);
});

test("saving as a subset closes the open tag picker", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await selectTiles(grid, tray, [0]);
  await tray.openTagPicker();
  // the picker ignores outside presses, but not another tray action
  await tray.createSubset("Picked while tagging");
  await tray.assert.showsNoTagPicker();
});
