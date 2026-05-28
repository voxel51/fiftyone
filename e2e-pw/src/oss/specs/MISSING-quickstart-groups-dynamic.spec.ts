import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("quickstart-groups");

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

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  await fiftyoneLoader.executePythonCode(
    `
      import fiftyone.zoo as foz

      dataset = foz.load_zoo_dataset(
          "quickstart-groups",
          dataset_name="${datasetName}"
      )
      dataset.persistent = True

      step = 25
      for slice in dataset.group_slices:
          dataset.group_slice = slice
          scene_id = 0
          order_by = 0
          for sample in dataset:
              sample.set_field("scene_id", scene_id // step)
              sample.set_field("timestamp", order_by % step)
              sample.save()
              scene_id += 1
              order_by += 1

      view = dataset.group_by("scene_id", order_by="timestamp")
      dataset.save_view("dynamic", view)
      `
  );
});

test.describe.serial("quickstart-groups", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ view: "dynamic" }),
    });
  });

  test("dynamic groups", async ({ grid, modal }) => {
    await grid.assert.isEntryCountTextEqualTo("8 groups with slice");
    await grid.assert.isLookerCountEqualTo(8);

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
