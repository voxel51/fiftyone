import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SelectionTrayPom } from "src/oss/poms/selection-tray";
import { ViewBarPom } from "src/oss/poms/viewbar/viewbar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  datasetName: string;
  grid: GridPom;
  tray: SelectionTrayPom;
  viewBar: ViewBarPom;
}>({
  datasetName: async ({ datasetFactory }, use, testInfo) => {
    const datasetName = getUniqueDatasetNameWithPrefix("selection-groups");
    if (testInfo.title.includes("dynamic"))
      // two scenes of two ordered samples each
      await datasetFactory.createDataset({
        datasetName,
        numSamples: 4,
        numbered: true,
        schema: { scene: "StringField", order: "IntField" },
        withSampleData: ({ index }) => ({
          scene: index < 2 ? "a" : "b",
          order: index % 2,
        }),
        savedViews: {
          dynamic: 'dataset.group_by("scene", order_by="order")',
        },
      });
    else
      await datasetFactory.createDataset({
        datasetName,
        mediaType: "group",
        numGroups: 2,
        slices: [
          { name: "left", mediaType: "image" },
          { name: "right", mediaType: "image" },
        ],
      });
    await use(datasetName);
  },
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  tray: async ({ page, eventUtils }, use) =>
    use(new SelectionTrayPom(page, eventUtils)),
  viewBar: async ({ page, eventUtils }, use) =>
    use(new ViewBarPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer }) => foWebServer.startWebServer());
test.afterAll(async ({ foWebServer }) => foWebServer.stopWebServer());

test("selected group slices exclude unchosen siblings", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.assert.isTileCountEqualTo(2);
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.createSubset("Left only", "Selected samples");
  await grid.afterGridRefreshed(() => tray.openCreatedSubset());
  await grid.assert.isTileCountEqualTo(1);
  await tray.clear();
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.cardsHaveNames(["left-0.png"]);

  await grid.selectSlice("right");
  await grid.assert.isEntryCountTextEqualTo("0 groups with slice");
  await grid.assert.isTileCountEqualTo(0);
  await grid.afterGridRefreshed(() => grid.selectSlice("left"));
  await grid.assert.isTileCountEqualTo(1);
});

test("all group slices include the selected group's sibling", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.createSubset("Both cameras", "All slices of these groups");
  await grid.afterGridRefreshed(() => tray.openCreatedSubset());
  await grid.assert.isTileCountEqualTo(1);
  await grid.afterGridRefreshed(() => grid.selectSlice("right"));
  await grid.assert.isTileCountEqualTo(1);
  await tray.clear();
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.cardsHaveNames(["right-0.png"]);
});

test("a limited dynamic group saves its concrete members", async ({
  datasetName,
  fiftyoneLoader,
  grid,
  page,
  tray,
  viewBar,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "dynamic" }),
  });
  await grid.assert.isEntryCountTextEqualTo("2 groups");
  const editor = await viewBar.addStage("Limit");
  await editor.fill("limit", "1");
  await grid.afterEntryCounts(() => grid.run(() => editor.commit("limit")));
  await grid.assert.isEntryCountTextEqualTo("1 group");
  await tray.afterSettled(() => grid.toggleSelectNthSample(0), { cards: 1 });
  await tray.assert.pills(["1 group · 2 samples selected"]);

  // the subset holds the group's samples, not the GroupBy or the Limit that
  // found them, and opens on those samples alone
  await tray.createSubset("First scene");
  await grid.afterGridRefreshed(() =>
    grid.afterEntryCounts(() => tray.openCreatedSubset()),
  );
  await tray.assert.subsetScope("First scene", 2);
  await grid.assert.isTileCountEqualTo(2);
});
