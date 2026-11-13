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
    ] as const,
);

// slices "0" to "99", several carousel pages
const SLICES = Array.from({ length: 100 }, (_, index) => String(index));

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  for (const [extension, datasetName] of extensionDatasetNamePairs) {
    const mediaType = extension === "mp4" ? "video" : "image";
    await datasetFactory.createDataset({
      mediaType: "group",
      datasetName,
      numGroups: 2,
      videoOptions: { container: "mp4", duration: 1, frameRate: 1 },
      slices: SLICES.map((name) => ({ name, mediaType })),
    });
  }
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
      await modal.afterCarouselRendered(() => grid.openFirstSample());
      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");
      await modal.scrollCarouselTo("19");
      await modal.navigateSlice("group.name", "19", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "19");

      await modal.scrollCarouselTo("39");
      await modal.navigateSlice("group.name", "39", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "39");

      await modal.scrollCarouselTo("59");
      await modal.navigateSlice("group.name", "59", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "59");

      await modal.scrollCarouselTo("79");
      await modal.navigateSlice("group.name", "79", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "79");

      await modal.scrollCarouselTo("99");
      await modal.navigateSlice("group.name", "99", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "99");

      await modal.scrollCarouselTo("0");
      await modal.navigateSlice("group.name", "0", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "0");
      await modal.close();
    });
  });
});
