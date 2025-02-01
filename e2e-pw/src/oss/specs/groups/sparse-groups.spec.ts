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

// todo: skipping pcd because slice navigation behavior is different
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

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
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
      dataset.add_group_field("group", default="first")
      dataset.persistent = True
  
      first_group = fo.Group()
      first = fo.Sample(filepath="first.${extension}", group=first_group.element("first"))
      first_shared = fo.Sample(filepath="shared.${extension}", group=first_group.element("shared"))
  
      second_group = fo.Group()
      second = fo.Sample(
          filepath="second.${extension}", group=second_group.element("second")
      )
      second_shared = fo.Sample(filepath="shared.${extension}", group=second_group.element("shared"))
  
      dataset.add_samples([first, first_shared, second, second_shared])

      `;
  });
  await fiftyoneLoader.executePythonCode(pythonCode);
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("sparse groups tests", () => {
  extensionDatasetNamePairs.forEach(([extension, datasetName]) => {
    test(`${extension} default slice`, async ({
      fiftyoneLoader,
      page,
      grid,
      modal,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.assert.isEntryCountTextEqualTo("1 group with slice");
      await grid.openFirstSample();
      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "first");
      await modal.navigateSlice("group.name", "shared", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "shared");
      await modal.close();
    });

    test(`${extension} shared slice`, async ({
      fiftyoneLoader,
      page,
      grid,
      modal,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.assert.isEntryCountTextEqualTo("1 group with slice");
      await grid.selectSlice("shared");
      await grid.assert.isEntryCountTextEqualTo("2 groups with slice");
      await grid.openFirstSample();
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "shared");
      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.navigateSlice("group.name", "first", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "first");
      await modal.navigateNextSample(true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "shared");
      await modal.navigateSlice("group.name", "second", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "second");
      await modal.navigatePreviousSample(true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "shared");
      await modal.navigateSlice("group.name", "first", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "first");
      await modal.close();
    });

    test(`${extension} second slice`, async ({
      fiftyoneLoader,
      page,
      grid,
      modal,
    }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
      await grid.assert.isEntryCountTextEqualTo("2 groups with slice");
      await grid.selectSlice("second");
      await grid.assert.isEntryCountTextEqualTo("1 group with slice");
      await grid.openFirstSample();
      await modal.sidebar.toggleSidebarGroup("GROUP");
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "second");
      await modal.navigateSlice("group.name", "shared", true);
      await modal.sidebar.assert.verifySidebarEntryText("group.name", "shared");
      await modal.close();
    });
  });
});
