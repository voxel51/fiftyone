import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SavedQueriesPom } from "src/oss/poms/saved-queries";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  datasetName: string;
  grid: GridPom;
  tray: SelectionTrayPom;
}>({
  datasetName: async ({ datasetFactory, fiftyoneLoader }, use) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-patches");
    await datasetFactory.createDataset({
      datasetName,
      numSamples: 2,
      numbered: true,
      schema: { predictions: "Detections" },
      withSampleData: ({ index }, { createId }) => ({
        predictions: {
          detections: [
            {
              _id: createId(),
              label: `parent-${index}-cat`,
              bounding_box: [0.1, 0.1, 0.2, 0.2],
            },
            {
              _id: createId(),
              label: `parent-${index}-dog`,
              bounding_box: [0.4, 0.4, 0.2, 0.2],
            },
          ],
        },
      }),
      savedViews: {
        patches: "dataset.to_patches('predictions')",
        samples: "dataset.view()",
      },
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
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer }) => foWebServer.startWebServer());
test.afterAll(async ({ foWebServer }) => foWebServer.stopWebServer());

test("patch subsets preserve two labels from one parent across scope switches", async ({
  eventUtils,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSettled(() => grid.toggleSelectNthSample(1), { cards: 1 });
  await tray.createSubset("Other parent");
  await grid.afterEntryCounts(() => tray.openCreatedSubset());
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await grid.afterEntryCounts(() => tray.chooseAllSamples());

  const savedQueries = new SavedQueriesPom(page, eventUtils);
  await savedQueries.open();
  // patch tiles of one parent share its file, and draw their labels together
  await grid.afterTagsRenderedNamed(["0.png"], () =>
    grid.afterEntryCounts(() => savedQueries.load("patches")),
  );
  await grid.assert.isEntryCountTextEqualTo("4 patches");
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.afterSettled(() => grid.toggleSelectNthSample(1), { cards: 2 });
  await tray.createSubset("First parent patches");
  await grid.afterTagsRenderedNamed(["0.png"], () =>
    grid.afterEntryCounts(() => tray.openCreatedSubset()),
  );
  await grid.assert.isEntryCountTextEqualTo("2 patches");
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");

  // a samples subset and a patches subset each reopen in their own view,
  // counted within the subset from the first count shown
  await tray.afterSettled(
    () => grid.afterEntryCounts(() => tray.chooseSubset("Other parent")),
    { cards: 1 },
  );
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await tray.assert.selectedSamples(1);
  await tray.afterSettled(
    () =>
      grid.afterTagsRenderedNamed(["0.png"], () =>
        grid.afterEntryCounts(() => tray.chooseSubset("First parent patches")),
      ),
    { cards: 2 },
  );
  await grid.assert.isEntryCountTextEqualTo("2 patches");
  await tray.assert.pills(["2 patches selected"]);
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");
});

for (const entry of ["menu", "direct link"] as const) {
  test(`patch captures survive saved-query history from ${entry}`, async ({
    eventUtils,
    datasetName,
    fiftyoneLoader,
    grid,
    page,
    tray,
  }) => {
    if (entry === "direct link") {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
        searchParams: new URLSearchParams({ view: "patches" }),
      });
    } else {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      const savedQueries = new SavedQueriesPom(page, eventUtils);
      await savedQueries.open();
      await grid.afterTagsRenderedNamed(["0.png"], () =>
        grid.afterEntryCounts(() => savedQueries.load("patches")),
      );
    }
    await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
    const viewBar = new ViewBarPom(page, eventUtils);
    const editor = await viewBar.addStage("Limit");
    await editor.fill("limit", "2");
    await grid.afterEntryCounts(() => grid.run(() => editor.commit("limit")));
    await grid.assert.isEntryCountTextEqualTo("2 patches");
    await grid.afterEntryCounts(() => grid.run(() => page.goBack()));
    await grid.assert.isEntryCountTextEqualTo("4 patches");
    await tray.assert.pills(["1 patch selected"]);
    await grid.afterEntryCounts(() => grid.run(() => page.goForward()));
    await grid.assert.isEntryCountTextEqualTo("2 patches");
    await tray.assert.pills(["1 patch selected"]);
  });
}

test("direct saved-query history keeps sample and patch captures separate", async ({
  eventUtils,
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "samples" }),
  });
  const savedQueries = new SavedQueriesPom(page, eventUtils);
  await savedQueries.open();
  await grid.afterTagsRenderedNamed(["0.png"], () =>
    grid.afterEntryCounts(() => savedQueries.load("patches")),
  );
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.afterSettled(
    () => grid.afterEntryCounts(() => grid.run(() => page.goBack())),
    { cards: 0 },
  );
  await grid.assert.isEntryCountTextEqualTo("2 samples");
  await tray.assert.targetsAllResults();
  await tray.afterSettled(() => grid.toggleSelectNthSample(1), { cards: 1 });
  await tray.afterSettled(
    () => grid.afterEntryCounts(() => grid.run(() => page.goForward())),
    { cards: 1 },
  );
  await grid.assert.isEntryCountTextEqualTo("4 patches");
  await tray.assert.pills(["1 patch selected"]);
});
