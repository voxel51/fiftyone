import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { SavedViewsPom } from "src/oss/poms/saved-views";
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
      savedViews: { patches: "dataset.to_patches('predictions')" },
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
  datasetName,
  eventUtils,
  fiftyoneLoader,
  grid,
  page,
  tray,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await tray.afterSelected(1, () => grid.toggleSelectNthSample(1));
  await tray.createSubset("Other parent");
  await grid.run(() => tray.openCreatedSubset("Other parent", "1 sample"));
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await grid.run(() => tray.chooseAllSamples());

  const savedViews = new SavedViewsPom(page, eventUtils);
  await savedViews.openSelect();
  await grid.afterTilesDrawn(4, () =>
    grid.run(() => savedViews.savedViewOption("patches").click()),
  );
  await grid.assert.isEntryCountTextEqualTo("4 patches");
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");
  await tray.afterSelected(2, async () => {
    await grid.toggleSelectNthSample(0);
    await grid.toggleSelectNthSample(1);
  });
  await tray.createSubset("First parent patches");
  await grid.afterTilesDrawn(2, () =>
    grid.run(() => tray.openCreatedSubset("First parent patches", "2 patches")),
  );
  await grid.assert.isEntryCountTextEqualTo("2 patches");
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");

  await grid.run(() =>
    tray.chooseSubset("Other parent", undefined, "1 sample"),
  );
  await grid.assert.isEntryCountTextEqualTo("1 sample");
  await tray.assert.noCards();
  await tray.afterResults(() =>
    grid.afterTilesDrawn(2, () =>
      grid.run(() =>
        tray.chooseSubset("First parent patches", undefined, "2 patches"),
      ),
    ),
  );
  await grid.assert.isEntryCountTextEqualTo("2 patches");
  await tray.assert.noCards();
  await grid.assert.nthSampleHasTagValue(0, "predictions", "parent-0-cat");
  await grid.assert.nthSampleHasTagValue(1, "predictions", "parent-0-dog");
  await tray.assert.contains("Act on all patches in the grid");
});
