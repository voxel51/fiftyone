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
    dataset.add_group_field("group", default="0")
    dataset.persistent = True

    first_group = fo.Group()
    second_group = fo.Group()
    samples = []
    for i in range(0, 100):
        first = fo.Sample(
            filepath=f"{i}-first.${extension}", group=first_group.element(f"{i}")
        )
        second = fo.Sample(
            filepath=f"{i}-second.${extension}", group=second_group.element(f"{i}")
        )
    
        samples.extend([first, second])
    
    dataset.add_samples(samples)`);
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test(`${extension} group carousel`, async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo("2 groups with slice");
    await grid.openFirstSample();
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");

    await modal.scrollCarousel();
    await modal.navigateSlice("group", "19", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "19");

    await modal.scrollCarousel();
    await modal.navigateSlice("group", "39", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "39");

    await modal.scrollCarousel();
    await modal.navigateSlice("group", "59", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "59");

    await modal.scrollCarousel();
    await modal.navigateSlice("group", "79", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "79");

    await modal.scrollCarousel();
    await modal.navigateSlice("group", "99", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "99");

    await modal.scrollCarousel(0);
    await modal.navigateSlice("group", "0", true);
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");
    await modal.close();
  });
});
