import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { GROUP_SLICES } from "./detections-data";

const datasetName = getUniqueDatasetNameWithPrefix("groups");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();

  // 16 groups, 2 per scene: 8 dynamic groups
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 16,
    slices: GROUP_SLICES,
    schema: { scene_id: "IntField", timestamp: "IntField" },
    withSampleData: ({ groupIndex }) => ({
      scene_id: Math.floor(groupIndex / 2),
      timestamp: groupIndex % 2,
    }),
    savedViews: {
      dynamic: 'dataset.group_by("scene_id", order_by="timestamp")',
    },
  });
});

test.describe.serial("groups-dynamic", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "dynamic" }),
    });
  });

  test("dynamic groups", async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo("8 groups with slice");
    await grid.assert.isTileCountEqualTo(8);

    await grid.openFirstSample();
    await modal.assert.verifyModalSamplePluginTitle("left", { pinned: true });
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "left");
    await modal.group.assert.assertIsCarouselVisible();
    await modal.navigateSlice("group.name", "right");
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "right");

    await modal.clickOnLooker3d();
    await modal.assert.verifyModalSamplePluginTitle("pcd", { pinned: true });
    await modal.sidebar.assert.verifySidebarEntryText("group.name", "pcd");
  });
});
