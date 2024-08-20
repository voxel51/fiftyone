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

// TODO: omitting 'mp4' because https://github.com/voxel51/fiftyone/issues/3421
const extensionDatasetNamePairs = ["pcd", "png"].map(
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
      for i in range(0, 100):
          sample = fo.Sample(filepath=f"{i}.${extension}", dynamic_group=i % 10)
          samples.append(sample)
      
      dataset.add_samples(samples)
      view = dataset.group_by("dynamic_group")
      dataset.save_view("dynamic-group", view)

      `;
  });
  await fiftyoneLoader.executePythonCode(pythonCode);
});

extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
  test(`${extension} dynamic group smoke test`, async ({
    page,
    fiftyoneLoader,
    grid,
    modal,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "dynamic-group" }),
    });

    await grid.assert.isEntryCountTextEqualTo("10 groups");

    await grid.openFirstSample();
    await modal.group.setDynamicGroupsNavigationMode("carousel");
    await modal.sidebar.assert.verifySidebarEntryText("dynamic_group", "0");
    await modal.scrollCarousel();
    await modal.navigateCarousel(4, true);
    await modal.sidebar.assert.verifySidebarEntryText("dynamic_group", "0");
  });

  test(`${extension} dynamic group pagination bar`, async ({
    page,
    fiftyoneLoader,
    grid,
    modal,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "dynamic-group" }),
    });
    await grid.openFirstSample();

    await modal.group.assert.assertIsPaginationBarVisible();
    await modal.group.assert.assertIsCarouselNotVisible();

    await modal.group.dynamicGroupPagination.assert.verifyPage(1);
    await modal.group.dynamicGroupPagination.assert.verifyPage(10);

    await modal.group.setDynamicGroupsNavigationMode("carousel");

    await modal.group.assert.assertIsCarouselVisible();
    await modal.group.assert.assertIsPaginationBarNotVisible();
  });
});
