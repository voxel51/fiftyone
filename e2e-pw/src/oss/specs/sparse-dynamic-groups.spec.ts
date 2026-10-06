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

const datasetName = getUniqueDatasetNameWithPrefix(`sparse-dynamic-groups`);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // scene "a" is two left-only groups, scene "b" two right-only groups
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 4,
    slices: [
      { name: "left", mediaType: "image", groupIndices: [0, 1] },
      { name: "right", mediaType: "image", groupIndices: [2, 3] },
    ],
    schema: { scene: "StringField", frame: "IntField" },
    withSampleData: ({ groupIndex }) => ({
      scene: groupIndex < 2 ? "a" : "b",
      frame: groupIndex % 2,
    }),
    savedViews: { group: 'dataset.group_by("scene", order_by="frame")' },
  });
});

test.describe("sparse dynamic groups", () => {
  test.afterEach(async ({ modal, page }) => {
    await modal.close({ ignoreError: true });
    await page.reload();
  });

  test(`left slice (default)`, async ({
    fiftyoneLoader,
    page,
    grid,
    modal,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "group" }),
    });

    await grid.assert.isEntryCountTextEqualTo("1 group with slice");
    await modal.group.dynamicGroupPagination.afterShown(() =>
      grid.openFirstSample(),
    );
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      frame: "0",
      "group.name": "left",
      scene: "a",
    });
    await modal.group.dynamicGroupPagination.assert.verifyPage(2);
    await modal.group.dynamicGroupPagination.assert.verifyTooltips({
      1: "frame: 0",
      2: "frame: 1",
    });
    await modal.group.dynamicGroupPagination.navigatePage(2);
    await modal.sidebar.assert.verifySidebarEntryTexts({
      frame: "1",
      "group.name": "left",
      scene: "a",
    });
  });

  test(`right slice`, async ({ fiftyoneLoader, page, grid, modal }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "group" }),
    });
    await grid.selectSlice("right");
    await grid.assert.isEntryCountTextEqualTo("1 group with slice");
    await modal.group.dynamicGroupPagination.afterShown(() =>
      grid.openFirstSample(),
    );
    await modal.sidebar.toggleSidebarGroup("GROUP");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      frame: "0",
      "group.name": "right",
      scene: "b",
    });
    await modal.group.dynamicGroupPagination.assert.verifyPage(2);
    await modal.group.dynamicGroupPagination.assert.verifyTooltips({
      1: "frame: 0",
      2: "frame: 1",
    });
    await modal.group.dynamicGroupPagination.navigatePage(2);
    await modal.sidebar.assert.verifySidebarEntryTexts({
      frame: "1",
      "group.name": "right",
      scene: "b",
    });
  });
});
