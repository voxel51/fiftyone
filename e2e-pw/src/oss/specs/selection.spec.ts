import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
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
    ] as const
);

test.beforeAll(async ({ fiftyoneLoader }) => {
  let pythonCode = `
      import fiftyone as fo
  `;

  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    pythonCode += `
      # ${extension} dataset
      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True
  
      samples = []
      for i in range(0, 5):
          sample = fo.Sample(filepath=f"{i}.${extension}")
          samples.append(sample)
      
      dataset.add_samples(samples)

      `;
  });
  await fiftyoneLoader.executePythonCode(pythonCode);
});

extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
  test(`${extension} grid selection`, async ({
    page,
    fiftyoneLoader,
    grid,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.assert.isEntryCountTextEqualTo("5 samples");
    await grid.toggleSelectFirstSample();
    await grid.assert.isSelectionCountEqualTo(1);
    await grid.toggleSelectNthSample(4);
    await grid.assert.isSelectionCountEqualTo(2);
    await grid.toggleSelectFirstSample();
    await grid.assert.isSelectionCountEqualTo(1);
    await grid.toggleSelectNthSample(4);
    await grid.assert.isSelectionCountEqualTo(0);

    // verify selection clears on escape
    await grid.toggleSelectFirstSample();
    await grid.assert.isSelectionCountEqualTo(1);
    await page.press("body", "Escape");
    await grid.assert.isSelectionCountEqualTo(0);
  });

  test(`${extension} modal selection`, async ({
    fiftyoneLoader,
    page,
    modal,
    grid,
  }) => {
    const isPcd = extension === "pcd";
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.toggleSelectFirstSample();
    await grid.assert.isNthSampleSelected(0);
    await grid.openNthSample(1);
    await modal.assert.verifySelectionCount(1);
    await modal.toggleSelection(isPcd);
    await modal.assert.verifySelectionCount(2);
    await modal.toggleSelection(isPcd);
    await modal.assert.verifySelectionCount(1);
    await modal.navigatePreviousSample(true);
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
