import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const extensionDatasetNamePairs = ["mp4", "pcd", "png"].map(
  (extension) =>
    [
      extension,
      getUniqueDatasetNameWithPrefix(`${extension}-sparse-groups`),
    ] as const,
);

const NUM_SAMPLES = 5;

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  for (const [extension, datasetName] of extensionDatasetNamePairs) {
    const numSamples = NUM_SAMPLES;
    if (extension === "mp4") {
      await datasetFactory.createDataset({
        mediaType: "video",
        datasetName,
        numSamples,
        videoOptions: { container: "mp4" },
      });
    } else if (extension === "pcd") {
      await datasetFactory.createDataset({
        mediaType: "point-cloud",
        datasetName,
        numSamples,
      });
    } else {
      await datasetFactory.createDataset({ datasetName, numSamples });
    }
  }
});

test.describe.serial("selection", () => {
  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    test(`${extension} selection`, async ({
      page,
      fiftyoneLoader,
      grid,
      modal,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.assert.isEntryCountTextEqualTo(`${NUM_SAMPLES} samples`);
      await grid.afterSelectionChanged(() => grid.toggleSelectFirstSample());
      await grid.assert.isSelectionCountEqualTo(1);
      await grid.afterSelectionChanged(() =>
        grid.toggleSelectNthSample(NUM_SAMPLES - 1),
      );
      await grid.assert.isSelectionCountEqualTo(2);
      await grid.afterSelectionChanged(() => grid.toggleSelectFirstSample());
      await grid.assert.isSelectionCountEqualTo(1);
      await grid.afterSelectionChanged(() =>
        grid.toggleSelectNthSample(NUM_SAMPLES - 1),
      );
      await grid.assert.isSelectionCountEqualTo(0);

      // verify selection clears on escape
      await grid.afterSelectionChanged(() => grid.toggleSelectFirstSample());
      await grid.assert.isSelectionCountEqualTo(1);
      page.once("dialog", (dialog) => dialog.accept());
      await grid.afterSelectionChanged(() => page.press("body", "Escape"));
      await grid.assert.isSelectionCountEqualTo(0);

      // check modal
      await page.reload();
      const isPcd = extension === "pcd";
      // the 3D viewer covers the sample checkbox until its scene settles
      const settled = (action: () => Promise<void>) =>
        isPcd ? modal.afterLooker3dSettled(action) : action();
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.afterSelectionChanged(() => grid.toggleSelectFirstSample());
      await grid.assert.isNthSampleSelected(0);
      await settled(() => grid.openNthSample(1));
      await modal.assert.verifySelectionCount(1);
      await modal.toggleSelection(isPcd);
      await modal.assert.verifySelectionCount(2);
      await modal.toggleSelection(isPcd);
      await modal.assert.verifySelectionCount(1);
      await settled(() => modal.navigatePreviousSample(true));
      await modal.toggleSelection(isPcd);
      await modal.assert.verifySelectionCount(0);

      // verify pressing escape clears modal but not selection
      await modal.toggleSelection(isPcd);
      await modal.assert.verifySelectionCount(1);
      await modal.close();
      await grid.assert.isSelectionCountEqualTo(1);

      await grid.openNthSample(1);
      await modal.assert.verifySelectionCount(1);
      await modal.close();
      await modal.assert.isClosed();
      await grid.assert.isSelectionCountEqualTo(1);
    });
  });
});
