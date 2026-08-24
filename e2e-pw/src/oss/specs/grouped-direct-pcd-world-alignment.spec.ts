import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Jimp } from "jimp";
import { expect, Locator, test as base } from "src/oss/fixtures";
import type { AnnotateSDK } from "src/oss/fixtures/annotate-sdk";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "grouped-direct-pcd-world-alignment",
);
const leftPcdPath = path.join(os.tmpdir(), `${datasetName}-lidar-left.pcd`);
const rightPcdPath = path.join(os.tmpdir(), `${datasetName}-lidar-right.pcd`);
const TEMP_FILE_PATHS = [leftPcdPath, rightPcdPath];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

type PersistedCuboid = {
  dimensions: number[];
  label: string;
  location: number[];
  rotation: number[];
};

const seedDataset = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  annotateSDK: AnnotateSDK,
) => {
  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.media as fom
from fiftyone.core.camera import StaticTransform

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="lidar_left")
dataset._doc.group_media_types = {
    "lidar_left": fom.POINT_CLOUD,
    "lidar_right": fom.POINT_CLOUD,
}
dataset.static_transforms = {
    "lidar_left::ego": StaticTransform(
        translation=[-8.0, 0.0, 0.0],
        quaternion=[0.0, 0.0, 0.7071067811865476, 0.7071067811865476],
        source_frame="lidar_left",
        target_frame="ego",
    ),
    "ego::world": StaticTransform(
        translation=[0.0, 0.0, 0.0],
        quaternion=[0.0, 0.0, 0.0, 1.0],
        source_frame="ego",
        target_frame="world",
    ),
    "lidar_right::world": StaticTransform(
        translation=[8.0, 0.0, 0.0],
        quaternion=[0.0, 0.0, 0.0, 1.0],
        source_frame="lidar_right",
        target_frame="world",
    ),
}

group = fo.Group()
left = fo.Sample(
    filepath=${JSON.stringify(leftPcdPath)},
    media_type="point-cloud",
    group=group.element("lidar_left"),
    detections=fo.Detections(
        detections=[
            fo.Detection(
                label="seeded-left",
                location=[1.5, 1.5, 1.5],
                dimensions=[2.0, 2.0, 2.0],
                rotation=[0.0, 0.0, 0.0],
            )
        ]
    ),
)
right = fo.Sample(
    filepath=${JSON.stringify(rightPcdPath)},
    media_type="point-cloud",
    group=group.element("lidar_right"),
)
dataset.add_samples([left, right])
dataset.persistent = True
  `);

  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["seeded-left", "world-created"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
};

const readLeftCuboids = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
): Promise<PersistedCuboid[]> => {
  const resultFile = path.join(
    os.tmpdir(),
    `grouped-world-cuboids-${datasetName}.json`,
  );

  await fiftyoneLoader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.select_group_slices("lidar_left").first()
cuboids = []
for detection in sample.detections.detections:
    cuboids.append({
        "label": detection.label,
        "location": list(detection.location),
        "dimensions": list(detection.dimensions),
        "rotation": list(detection.rotation),
    })

with open(${JSON.stringify(resultFile)}, "w") as f:
    json.dump(cuboids, f)
  `);

  const result = JSON.parse(
    fs.readFileSync(resultFile, "utf-8"),
  ) as PersistedCuboid[];
  fs.rmSync(resultFile, { force: true });
  return result;
};

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

test.beforeAll(
  async ({ annotateSDK, fiftyoneLoader, foWebServer, mediaFactory }) => {
    await foWebServer.startWebServer();
    mediaFactory.createPcd({
      outputPath: leftPcdPath,
      shape: "cube",
      numPoints: 216,
    });
    mediaFactory.createPcd({
      outputPath: rightPcdPath,
      shape: "cube",
      numPoints: 216,
    });
    await seedDataset(fiftyoneLoader, annotateSDK);
  },
);

test.afterAll(async ({ fiftyoneLoader, foWebServer }) => {
  try {
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")
    `);
  } catch (error) {
    void error;
  }

  try {
    await foWebServer.stopWebServer();
  } catch (error) {
    void error;
  }

  for (const filePath of TEMP_FILE_PATHS) {
    fs.rmSync(filePath, { force: true });
  }
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

  await expect
    .poll(
      async () => {
        const visiblePixels = await countOuterBandPixels(
          modal.annotate3d.canvas,
        );
        return Math.min(visiblePixels.left, visiblePixels.right);
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(30);

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

  let createdCuboid: PersistedCuboid | undefined;
  await expect
    .poll(
      async () => {
        const cuboids = await readLeftCuboids(fiftyoneLoader);
        createdCuboid = cuboids.find(
          (cuboid) => cuboid.label === "world-created",
        );
        return createdCuboid;
      },
      { timeout: 20_000 },
    )
    .toBeTruthy();

  expect(createdCuboid).toBeDefined();
  expect(createdCuboid!.location[0]).toBeCloseTo(2, 1);
  expect(createdCuboid!.location[1]).toBeCloseTo(-23.15, 1);
  expect(createdCuboid!.rotation[2]).toBeCloseTo(Math.PI / 2, 1);
  expect(createdCuboid!.dimensions.every((value) => value > 0)).toBe(true);

  const persistedX = createdCuboid!.location[0];
  await modal.close();
  await grid.openFirstSample();
  await modal.sidebar.switchMode("annotate");
  await modal.sidebar.annotate.selectAnnotationSlice("lidar_left");
  await modal.annotate3d.waitForSurface();
  await modal.annotate3d.assert.labelListed("world-created");
  await modal.annotate3d.selectLabel("world-created");
  await expect
    .poll(async () =>
      Number(await modal.annotate3d.geometryField("x").inputValue()),
    )
    .toBeCloseTo(persistedX, 2);
});
