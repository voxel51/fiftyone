/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Two point-cloud slices with different static transforms render aligned in
 * the world frame, and a cuboid drawn there is written back in the native
 * frame of the slice being annotated.
 */
import { Jimp } from "jimp";
import { expect, Locator, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import type { GeometryAxis } from "src/oss/poms/modal/annotate-3d";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "grouped-direct-pcd-world-alignment",
);
const QUARTER_TURN = [0, 0, 0.7071067811865476, 0.7071067811865476];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const countOuterBandPixels = async (canvas: Locator) => {
  const screenshot = await canvas.screenshot();
  const image = await Jimp.read(screenshot);
  const { data, width, height } = image.bitmap;

  const countBand = (minXFraction: number, maxXFraction: number) => {
    const minX = Math.floor(width * minXFraction);
    const maxX = Math.floor(width * maxXFraction);
    const minY = Math.floor(height * 0.15);
    const maxY = Math.floor(height * 0.85);
    let count = 0;

    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const offset = (y * width + x) * 4;
        if (
          data[offset + 3] > 0 &&
          data[offset] + data[offset + 1] + data[offset + 2] > 45
        ) {
          count++;
        }
      }
    }

    return count;
  };

  return {
    left: countBand(0.08, 0.42),
    right: countBand(0.58, 0.92),
  };
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      { name: "lidar_left", mediaType: "point-cloud" },
      { name: "lidar_right", mediaType: "point-cloud" },
    ],
    schema: {
      detections: "Detections",
      "detections.detections.location": "ListField<FloatField>",
      "detections.detections.dimensions": "ListField<FloatField>",
      "detections.detections.rotation": "ListField<FloatField>",
    },
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["seeded-left", "world-created"],
        attributes: [],
        component: "dropdown",
      },
    },
    // the left lidar reaches world through a yawed ego frame, the right directly
    staticTransforms: [
      {
        source_frame: "lidar_left",
        target_frame: "ego",
        translation: [-8, 0, 0],
        quaternion: QUARTER_TURN,
      },
      { source_frame: "ego", target_frame: "world" },
      {
        source_frame: "lidar_right",
        target_frame: "world",
        translation: [8, 0, 0],
      },
    ],
    withSampleData: ({ slice }, { label }) =>
      slice === "lidar_left"
        ? {
            detections: label.detections([
              label.detection({
                label: "seeded-left",
                location: [1.5, 1.5, 1.5],
                dimensions: [2, 2, 2],
                rotation: [0, 0, 0],
              }),
            ]),
          }
        : {},
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("aligns grouped direct PCDs in world and writes cuboids back to the native slice", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await page.evaluate(() =>
    window.localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
  );

  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute(true);
  await modal.looker3dControls.waitForAllAssetsLoaded();
  await modal.toggleLooker3dSlice("lidar_right");
  await modal.looker3dControls.waitForAllAssetsLoaded();
  await modal.looker3dControls.setTopView();
  await modal.looker3dControls.toggleGridHelper();

  // both slices are painted once the top view has rendered (`setTopView`
  // resolves on the settled frame), so one read of the outer bands suffices
  const visiblePixels = await countOuterBandPixels(modal.annotate3d.canvas);
  expect(Math.min(visiblePixels.left, visiblePixels.right)).toBeGreaterThan(30);

  await modal.sidebar.switchMode("annotate");
  await modal.sidebar.annotate.selectAnnotationSlice("lidar_left");
  await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(
    "lidar_left",
  );
  await modal.annotate3d.waitForSurface();
  await modal.annotate3d.enterCuboidMode();
  await modal.looker3dControls.setTopView();
  await modal.annotate3d.toggleCreateCuboid();
  await modal.annotate3d.drawCuboid([
    [0.42, 0.42],
    [0.58, 0.42],
    [0.58, 0.58],
  ]);
  await modal.sidebar.edit.selectFieldChoice("label", "world-created");
  await modal.sidebar.annotate.waitForSavesSettled();

  // reopening reads the saved cuboid back in lidar_left's native frame
  await modal.close();
  await grid.openFirstSample();
  await modal.sidebar.switchMode("annotate");
  await modal.sidebar.annotate.selectAnnotationSlice("lidar_left");
  await modal.annotate3d.waitForSurface();
  await modal.annotate3d.assert.labelListed("world-created");
  await modal.annotate3d.selectLabel("world-created");

  const geometry = async (axis: GeometryAxis) =>
    Number(await modal.annotate3d.getGeometry(axis));
  // the geometry inputs populate once the selected label's form mounts
  await expect(modal.annotate3d.geometryField("x")).not.toHaveValue("");
  expect(await geometry("x")).toBeCloseTo(2, 1);
  expect(await geometry("y")).toBeCloseTo(-23.15, 1);
  expect(await geometry("rz")).toBeCloseTo(Math.PI / 2, 1);
  for (const axis of ["lx", "ly", "lz"] as const) {
    expect(await geometry(axis)).toBeGreaterThan(0);
  }
});
