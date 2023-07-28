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
    for i in range(0, 100):
        sample = fo.Sample(filepath=f"{i}.${extension}", dynamic_group=i % 10)
        samples.append(sample)
    
    dataset.add_samples(samples)
    view = dataset.group_by("dynamic_group")
    dataset.save_view("dynamic-group", view)`);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilLoad(page, datasetName, "dynamic-group");
  });

  test(`${extension} dynamic group`, async ({ grid, modal }) => {
    await grid.assert.waitForEntryCountTextToEqual("10 groups");

    await grid.openFirstLooker();
    await modal.sidebarPom.assert.verifySidebarEntryText("dynamic_group", "0");
    await modal.scrollCarousel();
    await modal.navigateCarousel(4, true);
    await modal.sidebarPom.assert.verifySidebarEntryText("dynamic_group", "0");
  });
});
