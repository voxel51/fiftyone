import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("groups-dynamic");

// 16 groups paired into 8 dynamic groups of 2, ordered within each pair
const NUM_GROUPS = 16;
const GROUPS_PER_SCENE = 2;

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

  await datasetFactory.createGroupDataset({
    datasetName,
    numGroups: NUM_GROUPS,
    slices: [
      { name: "left", mediaType: "image" },
      { name: "right", mediaType: "image" },
      { name: "pcd", mediaType: "point-cloud" },
    ],
    withSampleData: ({ index }) => ({
      scene_id: Math.floor(index / GROUPS_PER_SCENE),
      timestamp: index % GROUPS_PER_SCENE,
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
