import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import fs from "node:fs";
import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";
import {
  getPlyCube,
  getPlyPointCloud,
} from "./fo3d-ascii-asset-factory/ply-factory";
import { getScreenshotMasks } from "./threed-utils";

const datasetName = getUniqueDatasetNameWithPrefix("fo3d-ply");

const plyMeshPath = `/tmp/test-ply-mesh-${datasetName}.ply`;
const plyPointCloudPath = `/tmp/test-ply-pointcloud-${datasetName}.ply`;
const scenePath = `/tmp/test-scene-${datasetName}.fo3d`;

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
  modalSidebar: async ({ page }, use) => {
    await use(new ModalSidebarPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer }) => {
  await foWebServer.startWebServer();

  fs.writeFileSync(plyMeshPath, getPlyCube());
  fs.writeFileSync(plyPointCloudPath, getPlyPointCloud());

  await fiftyoneLoader.executePythonCode(
    `
    import fiftyone as fo
    import fiftyone.utils.utils3d as fou3d

    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True

    scene = fo.Scene()
    
    # Add PLY mesh
    ply_mesh = fo.PlyMesh("ply_mesh", "${plyMeshPath}")
    ply_mesh.default_material = fo.MeshBasicMaterial(color="blue", opacity=0.8)
    ply_mesh.scale = 0.5
    ply_mesh.position = [1, 1, 0]
    scene.add(ply_mesh)

    # Add PLY point cloud
    ply_pointcloud = fo.PlyMesh("ply_pointcloud", "${plyPointCloudPath}", is_point_cloud=True)
    ply_pointcloud.scale = 2
    ply_pointcloud.position = [-1, 0, 0]
    scene.add(ply_pointcloud)
    
    scene.write("${scenePath}")

    sample1 = fo.Sample(filepath="${scenePath}", name="sample1")

    dataset.add_samples([sample1])
    `
  );
});

test.describe.serial("fo3d-ply", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("PLY scene is rendered correctly", async ({ modal, grid, page }) => {
    const mask = getScreenshotMasks(modal);

    await grid.openFirstSample();
    await modal.modalContainer.hover();

    await modal.looker3dControls.waitForAllAssetsLoaded();

    // Go to top view (press keyboard "T")
    await modal.looker3dControls.setTopView();

    // Hide grid helper (better for screenshots)
    await modal.looker3dControls.toggleGridHelper();

    await expect(modal.modalContainer).toHaveScreenshot(
      "ply-scene-top-view.png",
      {
        mask,
        animations: "allow",
      }
    );
  });
});
