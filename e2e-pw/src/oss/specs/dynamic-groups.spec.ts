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
    ] as const,
);

// enough samples per group for a carousel and a ten-page pagination bar
const NUM_GROUPS = 3;
const GROUP_SIZE = 10;

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  for (const [extension, datasetName] of extensionDatasetNamePairs) {
    const options = {
      datasetName,
      numSamples: NUM_GROUPS * GROUP_SIZE,
      schema: { dynamic_group: "IntField" as const },
      withSampleData: ({ index }: { index: number }) => ({
        dynamic_group: index % NUM_GROUPS,
      }),
      savedViews: { "dynamic-group": 'dataset.group_by("dynamic_group")' },
    };
    await (extension === "pcd"
      ? datasetFactory.createDataset({ mediaType: "point-cloud", ...options })
      : datasetFactory.createDataset(options));
  }
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("dynamic groups smoke test", () => {
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

      await grid.assert.isEntryCountTextEqualTo(`${NUM_GROUPS} groups`);

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
      await modal.group.dynamicGroupPagination.afterShown(() =>
        modal.afterSampleLoaded(() => grid.openFirstSample(), true),
      );

      await modal.group.assert.assertIsPaginationBarVisible();
      await modal.group.assert.assertIsCarouselNotVisible();

      await modal.group.dynamicGroupPagination.assert.verifyPage(1);
      await modal.group.dynamicGroupPagination.assert.verifyPage(GROUP_SIZE);

      await modal.group.setDynamicGroupsNavigationMode("carousel");

      await modal.group.assert.assertIsCarouselVisible();
      await modal.group.assert.assertIsPaginationBarNotVisible();
    });
  });
});
