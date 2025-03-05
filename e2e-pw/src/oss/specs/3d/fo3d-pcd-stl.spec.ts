import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import fs from "node:fs";
import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";
import { getStlCube } from "./fo3d-ascii-asset-factory/stl-factory";
import { getScreenshotMasks } from "./threed-utils";

const datasetName = getUniqueDatasetNameWithPrefix("fo3d-stl-pcd");

const pcdPath = `/tmp/test-pcd-${datasetName}.pcd`;
const stlPath = `/tmp/test-stl-${datasetName}.stl`;
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

test.describe("fo3d", () => {
  test.beforeAll(async ({ fiftyoneLoader, mediaFactory }) => {
    mediaFactory.createPcd({
      outputPath: pcdPath,
      shape: "cube",
      numPoints: 100,
    });

    fs.writeFileSync(stlPath, getStlCube());

    await fiftyoneLoader.executePythonCode(
      `
      import fiftyone as fo
      import fiftyone.utils.utils3d as fou3d

      dataset = fo.Dataset("${datasetName}")
      dataset.persistent = True

      scene = fo.Scene()
      stl = fo.StlMesh("stl", "${stlPath}")
      stl.default_material = fo.MeshBasicMaterial(color="red", opacity=0.7)
      stl.scale = 0.4
      stl.position = [1,1,0]
      scene.add(stl)

      pcd = fo.PointCloud("pcd", "${pcdPath}")
      pcd.scale = 2
      pcd.default_material.point_size = 7
      pcd.position = [-1,0,0]
      scene.add(pcd)
      scene.write("${scenePath}")

      sample1 = fo.Sample(filepath="${scenePath}", name="sample1")
      sample2 = fo.Sample(filepath="${scenePath}", name="sample2")

      points3d = [[[-5, -99, -2], [-8, 99, -2]], [[4, -99, -2], [1, 99, -2]]]
      polyline = fo.Polyline(label="polylines", points3d=points3d)

      location = [-0.4503350257873535, -21.61918580532074, 5.709099769592285]
      rotation = [0.0, 0.0, 0.0]
      dimensions = [50, 50.00003170967102, 50]
      boundingBox = fo.Detection(label="cuboid", location=location, rotation=rotation, dimensions=dimensions)

      sample1["polylines"] = fo.Polylines(polylines=[polyline])
      sample1["bounding_box"] = fo.Detections(detections=[boundingBox])

      sample2["polylines"] = fo.Polylines(polylines=[polyline])
      sample2["bounding_box"] = fo.Detections(detections=[boundingBox])

      dataset.add_samples([sample1, sample2])

      fou3d.compute_orthographic_projection_images(dataset, (-1, 64), "/tmp/ortho/${datasetName}") 
      `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("scene is rendered correctly", async ({ modal, grid, modalSidebar }) => {
    const mask = getScreenshotMasks(modal);

    await expect(grid.getForwardSection()).toHaveScreenshot(
      "orthographic-projection-grid-cuboids.png",
      {
        mask,
        animations: "allow",
      }
    );

    await grid.openFirstSample();
    await modal.modalContainer.hover();

    const leva = modal.looker3dControls.leva;

    await modal.looker3dControls.toggleRenderPreferences();
    await leva.getFolder("Visibility").hover();
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.modalContainer).toHaveScreenshot("scene.png", {
    //   mask,
    //   animations: "allow",
    // });

    await modal.looker3dControls.leva.toggleFolder("Labels");
    await leva.assert.verifyDefaultFolders();
    await leva.assert.verifyAssetFolders(["pcd", "stl"]);

    await leva.moveSliderToMin("Polyline Line Width");
    await leva.moveSliderToMin("Cuboid Line Width");
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "min-line-width-scene.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );

    await leva.moveSliderToMax("Polyline Line Width");
    await leva.moveSliderToMax("Cuboid Line Width");
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.modalContainer).toHaveScreenshot(
    //   "max-line-width-scene.png",
    //   {
    //     mask,
    //     animations: "allow",
    //   }
    // );

    // navigate to next sample and make sure the scene is rendered correctly
    // this time both cuboid and polyline widths should be bigger
    await modal.navigateNextSample();
    // TODO: FIX ME. MODAL SCREENSHOT COMPARISON IS OFF BY ONE-PIXEL
    // await expect(modal.modalContainer).toHaveScreenshot("scene-2.png", {
    //   mask,
    //   animations: "allow",
    // });
    await modalSidebar.assert.verifySidebarEntryText("name", "sample2");
  });
});
