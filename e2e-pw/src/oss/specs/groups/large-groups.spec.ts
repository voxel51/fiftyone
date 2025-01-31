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

// note: omitting "pcd" because we don't display carousel for pcd datasets
const extensionDatasetNamePairs = ["mp4", "png"].map(
  (extension) =>
    [
      extension,
      getUniqueDatasetNameWithPrefix(`${extension}-sparse-groups`),
    ] as const
);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();
  let pythonCode = `
      import fiftyone as fo
  `;

  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    pythonCode += `
      # ${extension} dataset
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
      
      dataset.add_samples(samples)
      `;
  });
  await fiftyoneLoader.executePythonCode(pythonCode);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("group carousel", () => {
  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    test(`${extension} group carousel`, async ({
      fiftyoneLoader,
      page,
      grid,
      modal,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.assert.isEntryCountTextEqualTo("2 groups with slice");
      await grid.openFirstSample();
      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");
      await modal.waitForCarouselToLoad();
      await modal.scrollCarousel();
      await modal.navigateSlice("group.name", "19", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "19");

      await modal.scrollCarousel();
      await modal.navigateSlice("group.name", "39", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "39");

      await modal.scrollCarousel();
      await modal.navigateSlice("group.name", "59", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "59");

      await modal.scrollCarousel();
      await modal.navigateSlice("group.name", "79", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "79");

      await modal.scrollCarousel();
      await modal.navigateSlice("group.name", "99", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "99");

      await modal.scrollCarousel(0);
      await modal.navigateSlice("group.name", "0", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");
      await modal.close();
    });
  });
});
