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

const datasetName = getUniqueDatasetNameWithPrefix(`modal-multi-pcd`);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      {
        name: "pcd1",
        mediaType: "point-cloud",
        pcdOptions: { shape: "cube", numPoints: 100 },
      },
      {
        name: "pcd2",
        mediaType: "point-cloud",
        pcdOptions: { shape: "diagonal", numPoints: 5 },
      },
    ],
  });
});

test.beforeEach(async ({ page, fiftyoneLoader }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
});

test.describe.serial("multi-pcd", () => {
  test("multi-pcd slice in modal", async ({ grid, modal }) => {
    await grid.openFirstSample();

    await modal.sampleCanvas3d.click(0.5, 0.5);

    await modal.toggleLooker3dSlice("pcd2");

    await modal.sidebar.assert.verifySidebarEntryText(
      "pcd1-group.name",
      "pcd1",
    );
    await modal.sidebar.assert.verifySidebarEntryText(
      "pcd2-group.name",
      "pcd2",
    );

    await modal.toggleLooker3dSlice("pcd1");

    await modal.sidebar.assert.verifySidebarEntryText("group.name", "pcd2");
  });
});
