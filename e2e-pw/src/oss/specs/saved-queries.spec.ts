import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SavedQueriesPom } from "src/oss/poms/saved-queries";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

//
// Saved queries are the dataset's saved views under their product name: a
// view saved through the SDK is listed and loads as a query, and a query
// saved in the App is a saved view. A dataset per test, since the server
// session keeps the loaded query across page loads.
//

const EVEN = { name: "even", slug: "even" };
const KEPT = { name: "kept", slug: "kept" };

const test = base.extend<{
  /** More SDK-saved views, named "query 1" and so on, for a long list */
  extraQueries: number;
  /** Seeds the test's dataset and opens it, before every test */
  dataset: void;
  grid: GridPom;
  savedQueries: SavedQueriesPom;
  tray: SelectionTrayPom;
  viewBar: ViewBarPom;
}>({
  extraQueries: [0, { option: true }],
  dataset: [
    async ({ datasetFactory, extraQueries, fiftyoneLoader, page }, use) => {
      const datasetName = getUniqueDatasetNameWithPrefix("saved-queries");
      await datasetFactory.createDataset({
        datasetName,
        numSamples: 6,
        withSampleData: ({ index }) => ({
          tags: index < 2 ? ["keep"] : [],
        }),
        savedViews: {
          // saved through the SDK, before saved queries existed
          even: 'dataset.match(fo.ViewField("index") % 2 == 0)',
          "first three": 'dataset.match(fo.ViewField("index") < 3)',
          kept: 'dataset.match_tags("keep")',
          ...Object.fromEntries(
            Array.from({ length: extraQueries }, (_, i) => [
              `query ${i + 1}`,
              `dataset.limit(${i + 1})`,
            ]),
          ),
        },
      });
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await use();
    },
    { auto: true },
  ],
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  savedQueries: async ({ page, eventUtils }, use) =>
    use(new SavedQueriesPom(page, eventUtils)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
});

/** Applies a Skip stage, which drops the first `count` samples */
async function skip(grid: GridPom, viewBar: ViewBarPom, count: number) {
  const editor = await viewBar.addStage("Skip");
  await editor.fill("skip", String(count));
  await grid.afterEntryCounts(() => grid.run(() => editor.commit("skip")));
}

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("lists saved views as saved queries and loads one", async ({
  grid,
  savedQueries,
}) => {
  await savedQueries.open();
  await savedQueries.assert.listsSlugs(["even", "first-three", "kept"]);
  // the bare dataset is not a query
  await savedQueries.assert.offersNothingToSave();

  await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));
  await grid.assert.isEntryCountTextEqualTo("3 samples");
  await savedQueries.assert.isLoaded(EVEN);

  await savedQueries.open();
  await savedQueries.assert.marksLoaded(EVEN.slug);
  // the loaded query is already saved; there is nothing new to save
  await savedQueries.assert.offersNoSave();
});

test("saves the working view as a new query that loads", async ({
  grid,
  savedQueries,
  viewBar,
}) => {
  await skip(grid, viewBar, 2);
  await savedQueries.open();
  await savedQueries.assert.describesDefinition("1 stage");
  await savedQueries.save("Past two", {
    description: "All but the first two",
    color: "green",
  });

  await savedQueries.assert.listsSlugs([
    "even",
    "first-three",
    "kept",
    "past-two",
  ]);
  await savedQueries.assert.rowReads(
    "past-two",
    "Past two\nLoaded\nAll but the first two",
  );
  await savedQueries.assert.isLoaded({ name: "Past two", slug: "past-two" });
  await grid.assert.isEntryCountTextEqualTo("4 samples");
  // saving it again would only duplicate it
  await savedQueries.assert.offersNoSave();
});

test("rejects a name whose slug another query uses", async ({
  grid,
  savedQueries,
  viewBar,
}) => {
  await skip(grid, viewBar, 1);
  await savedQueries.open();
  await savedQueries.nameInput.fill("First  THREE");

  await savedQueries.assert.rejectsName("“first three” already uses this name");
});

test("includes the tray selection only when asked", async ({
  grid,
  savedQueries,
}) => {
  await grid.toggleSelectNthSample(0);
  await grid.toggleSelectNthSample(1);
  await savedQueries.open();
  // the bare dataset is not a query until the selection limits it
  await savedQueries.nameInput.fill("Picked");
  await savedQueries.assert.cannotSave();

  await savedQueries.includeSelection.click();
  await savedQueries.assert.describesDefinition("2 selected samples");

  await grid.afterEntryCounts(() => savedQueries.save("Picked"));
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await savedQueries.assert.isLoaded({ name: "Picked", slug: "picked" });
});

test("edits a loaded query's metadata and follows its new slug", async ({
  grid,
  savedQueries,
}) => {
  await savedQueries.open();
  await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));

  await savedQueries.open();
  await savedQueries.openEditor(EVEN.slug);
  await savedQueries.edit(
    { name: "Even rows", description: "Every other sample", color: "blue" },
    { loaded: true },
  );

  await savedQueries.assert.listsSlugs(["even-rows", "first-three", "kept"]);
  await savedQueries.assert.rowReads(
    "even-rows",
    "Even rows\nLoaded\nEvery other sample",
  );
  await savedQueries.assert.isLoaded({ name: "Even rows", slug: "even-rows" });
});

test("deletes the loaded query and returns to the unsaved view", async ({
  grid,
  savedQueries,
}) => {
  await savedQueries.open();
  await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));

  await savedQueries.open();
  await grid.afterEntryCounts(() =>
    savedQueries.delete(EVEN.slug, { loaded: true }),
  );

  await savedQueries.assert.listsSlugs(["first-three", "kept"]);
  await savedQueries.assert.isUnloaded();
  await grid.assert.isEntryCountTextEqualTo("6 samples");

  await savedQueries.delete("first-three");
  await savedQueries.delete(KEPT.slug);
  await savedQueries.assert.showsEmptyList();
});

test("clearing the view unloads the query", async ({ grid, savedQueries }) => {
  await savedQueries.open();
  await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));

  await grid.afterEntryCounts(() => savedQueries.clearView());

  await savedQueries.assert.isUnloaded();
  await grid.assert.isEntryCountTextEqualTo("6 samples");
});

test.describe("a long list", () => {
  test.use({ extraQueries: 5 });

  test("searches by name, slug, or description", async ({ savedQueries }) => {
    await savedQueries.open();

    await savedQueries.search("QUERY 3");
    await savedQueries.assert.listsSlugs(["query-3"]);
    await savedQueries.search("nothing");
    await savedQueries.assert.listsSlugs([]);
    await savedQueries.search("query");
    await savedQueries.assert.listsSlugs([
      "query-1",
      "query-2",
      "query-3",
      "query-4",
      "query-5",
    ]);
  });
});

//
// A saved query stores how to find results; a subset stores the members
// captured from them. They meet in the grid but never rewrite each other.
//
test.describe("saved queries and subsets", () => {
  test("a query runs within the open subset, which saving leaves out", async ({
    grid,
    savedQueries,
    tray,
    viewBar,
  }) => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(1);
    await tray.createSubset("Pair");
    await grid.afterEntryCounts(() => tray.openCreatedSubset());

    await savedQueries.open();
    // index 0 is the subset's only even sample
    await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));
    await grid.assert.isEntryCountTextEqualTo("1 sample");

    await grid.afterEntryCounts(() => savedQueries.clearView());
    await skip(grid, viewBar, 1);
    await grid.assert.isEntryCountTextEqualTo("1 sample");
    await savedQueries.open();
    await savedQueries.assert.notesScope(
      "The open subset isn’t saved\nThe query saves its stages only. Loading it later runs them on whatever scope is open, such as the full dataset.",
    );
    await savedQueries.save("Past one");
    // a new scope starts without the query; loading it again runs it there
    await grid.afterEntryCounts(() => tray.chooseAllSamples());
    await grid.assert.isEntryCountTextEqualTo("6 samples");
    await savedQueries.assert.isUnloaded();
    await savedQueries.open();
    await grid.afterEntryCounts(() => savedQueries.load("past-one"));

    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await savedQueries.assert.isLoaded({ name: "Past one", slug: "past-one" });
  });

  test("a subset keeps the members it captured while the query finds new ones", async ({
    grid,
    savedQueries,
    tray,
  }) => {
    await savedQueries.open();
    await grid.afterEntryCounts(() => savedQueries.load(KEPT.slug));
    // nothing selected: the subset captures all of the query's results
    await tray.createSubset("Kept snapshot");

    // a third sample joins the query's results; the subset never captured it
    await grid.afterEntryCounts(() => savedQueries.clearView());
    await grid.toggleSelectNthSample(4);
    await tray.addExistingTag("keep");
    await savedQueries.open();
    await grid.afterEntryCounts(() => savedQueries.load(KEPT.slug));
    await grid.assert.isEntryCountTextEqualTo("3 samples");

    await grid.afterEntryCounts(() => tray.chooseSubset("Kept snapshot"));
    await grid.assert.isEntryCountTextEqualTo("2 samples");
    // the subset records the saved query it was captured from
    await tray.openScope();
    await tray.assert.capturedFrom("From saved query “kept”");
  });

  test("deleting a query keeps the subsets captured from it", async ({
    grid,
    savedQueries,
    tray,
  }) => {
    await savedQueries.open();
    await grid.afterEntryCounts(() => savedQueries.load(EVEN.slug));
    await tray.createSubset("From even");

    await savedQueries.open();
    await grid.afterEntryCounts(() =>
      savedQueries.delete(EVEN.slug, { loaded: true }),
    );
    await grid.afterEntryCounts(() => tray.chooseSubset("From even"));

    await grid.assert.isEntryCountTextEqualTo("3 samples");
    await savedQueries.assert.isUnloaded();
  });
});
