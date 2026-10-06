import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";

const datasetName = getUniqueDatasetNameWithPrefix("fo3d-ply");

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  modalSidebar: ModalSidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  modalSidebar: async ({ page, eventUtils }, use) => {
    await use(new ModalSidebarPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // a blue cube mesh and a PLY point cloud beside it
  await datasetFactory.createDataset({
    mediaType: "3d",
    datasetName,
    sceneOptions: {
      meshes: [
        {
          shape: "cube",
          vertexColors: false,
          name: "ply_mesh",
          material: {
            _type: "MeshBasicMaterial",
            color: "blue",
            opacity: 0.8,
            wireframe: false,
          },
          scale: 0.5,
          position: [1, 1, 0],
        },
        {
          shape: "point-cloud",
          numPoints: 125,
          name: "ply_pointcloud",
          isPointCloud: true,
          scale: 0.5,
          position: [-1, 0, 0],
        },
      ],
    },
  });
});

test.describe.serial("fo3d-ply", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("PLY scene is rendered correctly", async ({ modal, grid, page }) => {
    await page.evaluate(() => {
      localStorage.setItem("fo-3d-annotation-tips-dismissed", "true");
    });
    await modal.looker3dControls.afterAllAssetsLoaded(() =>
      grid.openFirstSample(),
    );
    await modal.modalContainer.hover();

    // Go to top view (press keyboard "T")
    await modal.looker3dControls.setTopView();

    // Hide grid helper (better for screenshots)
    await modal.looker3dControls.toggleGridHelper();

    await modal.sampleCanvas3d.assert.hasScreenshot("ply-scene-top-view.png");
  });
});
