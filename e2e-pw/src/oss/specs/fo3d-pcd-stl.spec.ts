import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

import { ModalSidebarPom } from "src/oss/poms/modal/modal-sidebar";

const datasetName = getUniqueDatasetNameWithPrefix("fo3d-stl-pcd");

const SAMPLE_NAMES = ["sample1", "sample2"];

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
  // a red STL cube and a point cloud beside it, with a polyline and a cuboid
  await datasetFactory.createDataset({
    mediaType: "3d",
    datasetName,
    numSamples: SAMPLE_NAMES.length,
    sceneOptions: {
      stlMeshes: [
        {
          name: "stl",
          material: {
            _type: "MeshBasicMaterial",
            color: "red",
            opacity: 0.7,
            wireframe: false,
          },
          scale: 0.4,
          position: [1, 1, 0],
        },
      ],
      pointClouds: [
        {
          shape: "cube",
          numPoints: 100,
          name: "pcd",
          material: { pointSize: 7 },
          scale: 2,
          position: [-1, 0, 0],
        },
      ],
    },
    schema: {
      name: "StringField",
      polylines: "Polylines",
      "polylines.polylines.points3d":
        "ListField<ListField<ListField<FloatField>>>",
      bounding_box: "Detections",
      "bounding_box.detections.location": "ListField<FloatField>",
      "bounding_box.detections.dimensions": "ListField<FloatField>",
      "bounding_box.detections.rotation": "ListField<FloatField>",
    },
    withSampleData: ({ index }, { label }) => ({
      name: SAMPLE_NAMES[index],
      polylines: label.polylines([
        label.polyline({
          label: "polylines",
          points: [],
          points3d: [
            [
              [-5, -99, -2],
              [-8, 99, -2],
            ],
            [
              [4, -99, -2],
              [1, 99, -2],
            ],
          ],
        }),
      ]),
      bounding_box: label.detections([
        label.detection({
          label: "cuboid",
          location: [
            -0.4503350257873535, -21.61918580532074, 5.709099769592285,
          ],
          rotation: [0.0, 0.0, 0.0],
          dimensions: [50, 50.00003170967102, 50],
        }),
      ]),
    }),
    orthographicProjections: { size: [-1, 64] },
  });
});

test.describe.serial("fo3d", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      tiles: SAMPLE_NAMES.length,
    });
  });

  test("scene is rendered correctly", async ({
    eventUtils,
    page,
    modal,
    grid,
    modalSidebar,
  }) => {
    await grid.assert.hasTileScreenshots(
      "orthographic-projection-grid-cuboids",
      SAMPLE_NAMES.length,
    );

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
    await modal.sampleCanvas3d.assert.hasScreenshot("scene.png");

    await modal.looker3dControls.leva.toggleFolder("Labels");
    await leva.assert.verifyDefaultFolders();
    await leva.assert.verifyAssetFolders(["pcd", "stl"]);

    // each slider sets one width, which the labels report once drawn with it
    const afterLineWidths = (action: () => Promise<unknown>) =>
      eventUtils.after("e2e:looker3d:line-widths", action);
    await afterLineWidths(() => leva.moveSliderToMin("Polyline Line Width"));
    await afterLineWidths(() => leva.moveSliderToMin("Cuboid Line Width"));
    await modal.sampleCanvas3d.assert.hasScreenshot("min-line-width-scene.png");

    await afterLineWidths(() => leva.moveSliderToMax("Polyline Line Width"));
    await afterLineWidths(() => leva.moveSliderToMax("Cuboid Line Width"));
    await modal.sampleCanvas3d.assert.hasScreenshot("max-line-width-scene.png");

    // the next sample's scene keeps the max widths
    await modal.afterLooker3dSettled(() => modal.navigateNextSample());
    await modal.sampleCanvas3d.assert.hasScreenshot("scene-2.png");
    await modalSidebar.assert.verifySidebarEntryText("name", SAMPLE_NAMES[1]);
  });
});
