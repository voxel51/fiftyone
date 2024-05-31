import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import fs from "node:fs";
import { getStlCube } from "./fo3d-ascii-asset-factory/stl-factory";
import { getScreenshotMasks } from "./threed-utils";

const datasetName = getUniqueDatasetNameWithPrefix("fo3d-stl-pcd");

const pcdPath = `/tmp/test-pcd-${datasetName}.pcd`;
const stlPath = `/tmp/test-stl-${datasetName}.stl`;
const scenePath = `/tmp/test-scene-${datasetName}.fo3d`;

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
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

      sample = fo.Sample(filepath="${scenePath}")
      dataset.add_sample(sample)

      fou3d.compute_orthographic_projection_images(dataset, (-1, 64), "/tmp/ortho/${datasetName}") 
      `
    );
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("scene is rendered correctly", async ({ modal, grid }) => {
    const mask = getScreenshotMasks(modal);

    await expect(grid.firstFlashlightSection).toHaveScreenshot(
      "orthographic-projection-grid-cuboids.png",
      {
        mask,
        animations: "allow",
      }
    );

    await grid.openFirstSample();
    await modal.modalContainer.hover();
    await expect(modal.modalContainer).toHaveScreenshot("scene.png", {
      mask,
      animations: "allow",
    });
  });
});
