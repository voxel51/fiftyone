import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import fs from "node:fs";
import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";
import { getStlCube } from "./fo3d-ascii-asset-factory/stl-factory";

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
  modalSidebar: async ({ page, eventUtils }, use) => {
    await use(new ModalSidebarPom(page, eventUtils));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

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
    `,
  );
});

test.describe.serial("fo3d", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, { tiles: 2 });
  });

  test("scene is rendered correctly", async ({
    eventUtils,
    page,
    modal,
    grid,
    modalSidebar,
  }) => {
    await grid.assert.hasScreenshot("orthographic-projection-grid-cuboids.png");

    await page.evaluate(() =>
      localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
    );
    // each loaded asset adds its folders to the render preferences
    await modal.looker3dControls.afterAllAssetsLoaded(() =>
      grid.openFirstSample(),
    );

    const leva = modal.looker3dControls.leva;

    // the leva panel sits off the canvas, so no label is hovered
    await modal.looker3dControls.toggleRenderPreferences();
    await leva.getFolder("Visibility").hover();
    await modal.assert.hasLooker3dScreenshot("scene.png");

    await modal.looker3dControls.leva.toggleFolder("Labels");
    await leva.assert.verifyDefaultFolders();
    await leva.assert.verifyAssetFolders(["pcd", "stl"]);

    // each slider sets one width, which the labels report once drawn with it
    const afterLineWidths = (action: () => Promise<unknown>) =>
      eventUtils.after("e2e:looker3d:line-widths", action);
    await afterLineWidths(() => leva.moveSliderToMin("Polyline Line Width"));
    await afterLineWidths(() => leva.moveSliderToMin("Cuboid Line Width"));
    await modal.assert.hasLooker3dScreenshot("min-line-width-scene.png");

    await afterLineWidths(() => leva.moveSliderToMax("Polyline Line Width"));
    await afterLineWidths(() => leva.moveSliderToMax("Cuboid Line Width"));
    await modal.assert.hasLooker3dScreenshot("max-line-width-scene.png");

    // the next sample's scene keeps the max widths
    await modal.afterLooker3dSettled(() => modal.navigateNextSample());
    await modal.assert.hasLooker3dScreenshot("scene-2.png");
    await modalSidebar.assert.verifySidebarEntryText("name", "sample2");
  });
});
