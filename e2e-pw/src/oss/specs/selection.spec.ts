import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

["mp4", "pcd", "png"].forEach((extension) => {
  const datasetName = getUniqueDatasetNameWithPrefix(
    `${extension}-sparse-groups`
  );
  const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
    grid: async ({ page }, use) => {
      await use(new GridPom(page));
    },
    modal: async ({ page }, use) => {
      await use(new ModalPom(page));
    },
  });

  test.beforeAll(async ({ fiftyoneLoader }) => {
    await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    samples = []
    for i in range(0, 5):
        sample = fo.Sample(filepath=f"{i}.${extension}")
        samples.append(sample)
    
    dataset.add_samples(samples)`);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName);
  });

  test(`${extension} grid selection`, async ({ grid }) => {
    await grid.assert.waitForEntryCountTextToEqual("5 samples");
    await grid.toggleSelectFirstLooker();
    await grid.assert.verifySelection(1);
    await grid.toggleSelectNthLooker(4);
    await grid.assert.verifySelection(2);
    await grid.toggleSelectFirstLooker();
    await grid.assert.verifySelection(1);
    await grid.toggleSelectNthLooker(4);
    await grid.assert.verifySelection(0);
  });

  test(`${extension} modal selection`, async ({ modal, grid }) => {
    await grid.toggleSelectFirstLooker();
    await grid.openNthLooker(1);
    await modal.assert.verifySelection(1);
    await modal.toggleSelection();
    await modal.assert.verifySelection(2);
    await modal.toggleSelection();
    await modal.assert.verifySelection(1);
    await modal.navigatePreviousSample(true);
    await modal.toggleSelection();
    await modal.assert.verifySelection(0);
  });
});
