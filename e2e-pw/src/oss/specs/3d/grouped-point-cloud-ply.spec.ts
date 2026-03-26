import fs from "node:fs";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("grouped-point-cloud-ply");
const groupSpecs = [1, 2, 3].map((index) => ({
  scene: `scene-${index}`,
  imagePath: `/tmp/grouped-point-cloud-ply-${datasetName}-${index}.png`,
  pcdPath: `/tmp/grouped-point-cloud-ply-${datasetName}-${index}.pcd`,
  plyPath: `/tmp/grouped-point-cloud-ply-${datasetName}-${index}.ply`,
  imageName: `scene-${index}-image`,
  pcdName: `scene-${index}-pcd`,
  plyName: `scene-${index}-ply`,
  offset: index * 0.15,
}));
const TEMP_FILE_PATHS = groupSpecs.flatMap((spec) => [
  spec.imagePath,
  spec.pcdPath,
  spec.plyPath,
]);

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ fiftyoneLoader, foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();

  await Promise.all(
    groupSpecs.map((spec, index) =>
      mediaFactory.createBlankImage({
        outputPath: spec.imagePath,
        width: 320,
        height: 240,
        fillColor: ["#22577a", "#2a9d8f", "#8f5a3c"][index],
        watermarkString: spec.scene,
        hideLogs: true,
      })
    )
  );

  groupSpecs.forEach((spec, index) => {
    mediaFactory.createPcd({
      outputPath: spec.pcdPath,
      shape: index === 1 ? "diagonal" : "cube",
      numPoints: index === 1 ? 18 : 216,
    });
    mediaFactory.createPly({
      outputPath: spec.plyPath,
      shape: "cube",
      color: [
        [255, 155, 64],
        [96, 200, 164],
        [118, 168, 255],
      ][index] as [number, number, number],
    });
  });

  await fiftyoneLoader.executePythonCode(`
import json

import fiftyone as fo
import fiftyone.core.media as fom

specs = json.loads(r'''${JSON.stringify(groupSpecs)}''')

def seed_group_media_types(dataset, group_media_types):
    current = dict(dataset._doc.group_media_types or {})
    current.update(group_media_types)
    dataset._doc.group_media_types = current
    dataset.save()

def make_image_detection(label):
    return fo.Detection(
        label=label,
        bounding_box=[0.22, 0.24, 0.35, 0.4],
        confidence=0.91,
    )

def make_3d_detection(label, offset):
    return fo.Detection(
        label=label,
        location=[offset, 0.0, 0.1],
        dimensions=[0.9, 0.7, 0.5],
        rotation=[0.0, offset, 0.1],
        confidence=0.96,
    )

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="image")
seed_group_media_types(
    dataset,
    {
        "image": fom.IMAGE,
        "pcd": fom.POINT_CLOUD,
        "ply": fom.THREE_D,
    },
)
dataset.persistent = True

samples = []
for spec in specs:
    group = fo.Group()

    image = fo.Sample(
        filepath=spec["imagePath"],
        group=group.element("image"),
        name=spec["imageName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[make_image_detection(f'{spec["scene"]}-image')]
        ),
    )
    pcd = fo.Sample(
        filepath=spec["pcdPath"],
        media_type="point-cloud",
        group=group.element("pcd"),
        name=spec["pcdName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[make_3d_detection(f'{spec["scene"]}-pcd', spec["offset"])]
        ),
    )
    ply = fo.Sample(
        filepath=spec["plyPath"],
        media_type="3d",
        group=group.element("ply"),
        name=spec["plyName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[
                make_3d_detection(
                    f'{spec["scene"]}-ply',
                    spec["offset"] + 0.2,
                )
            ]
        ),
    )

    samples.extend([image, pcd, ply])

dataset.add_samples(samples)
  `);
});

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

  try {
    for (const filePath of TEMP_FILE_PATHS) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        void error;
      }
    }
  } catch (error) {
    void error;
  }
});

test.describe.serial("grouped point-cloud and ply", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("reconciles point-cloud and ply slices across grouped navigation", async ({
    grid,
    modal,
  }) => {
    const assertSingleSliceState = async (
      index: number,
      expectedSlice: "image" | "pcd" | "ply"
    ) => {
      const spec = groupSpecs[index];
      const expectedName =
        expectedSlice === "image"
          ? spec.imageName
          : expectedSlice === "pcd"
          ? spec.pcdName
          : spec.plyName;

      await modal.looker3dControls.waitForAllAssetsLoaded();

      await modal.assert.verifyModalSamplePluginTitle(expectedSlice, {
        pinned: true,
      });
      await modal.sidebar.assert.verifySidebarEntryTexts({
        "group.name": expectedSlice,
        name: expectedName,
        scene: spec.scene,
      });
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
    };

    const assertImageSliceState = async (index: number) => {
      const spec = groupSpecs[index];

      await modal.assert.verifyModalSamplePluginTitle("image", {
        pinned: true,
      });
      await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
        "group.name": "image",
        name: spec.imageName,
        scene: spec.scene,
      });
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
    };

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.looker3dControls.waitForAllAssetsLoaded();

    await modal.assert.verifyModalSamplePluginTitle("image", { pinned: true });
    await modal.looker3dControls.assert.verifySliceSelectorLabel("pcd");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "group.name": "image",
      name: groupSpecs[0].imageName,
      scene: groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);

    await modal.clickOnLooker3d();
    await assertSingleSliceState(0, "pcd");
    await modal.looker3dControls.assert.verifySliceSelectorLabel("pcd");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd");
    await modal.looker3dControls.assert.verifySliceChecked("ply", false);
    await modal.looker3dControls.closeSliceSelector();

    await modal.toggleLooker3dSlice("ply");
    await modal.looker3dControls.waitForAllAssetsLoaded();
    await modal.assert.verifyModalSamplePluginTitle("pcd and ply", {
      pinned: true,
    });
    await modal.looker3dControls.assert.verifySliceSelectorLabel(
      "all 3D slices"
    );
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "pcd-group.name": "pcd",
      "ply-group.name": "ply",
      "pcd-name": groupSpecs[0].pcdName,
      "ply-name": groupSpecs[0].plyName,
      "pcd-scene": groupSpecs[0].scene,
      "ply-scene": groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd");
    await modal.looker3dControls.assert.verifySliceChecked("ply");
    await modal.looker3dControls.closeSliceSelector();

    await modal.groupLooker.click();
    await assertImageSliceState(0);
    await modal.clickOnLooker3d();
    await modal.looker3dControls.waitForAllAssetsLoaded();
    await modal.assert.verifyModalSamplePluginTitle("pcd and ply", {
      pinned: true,
    });
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "pcd-group.name": "pcd",
      "ply-group.name": "ply",
      "pcd-name": groupSpecs[0].pcdName,
      "ply-name": groupSpecs[0].plyName,
      "pcd-scene": groupSpecs[0].scene,
      "ply-scene": groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);

    await modal.toggleLooker3dSlice("pcd");
    await assertSingleSliceState(0, "ply");
    await modal.looker3dControls.assert.verifySliceSelectorLabel("ply");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd", false);
    await modal.looker3dControls.assert.verifySliceChecked("ply");
    await modal.looker3dControls.closeSliceSelector();

    await modal.groupLooker.click();
    await assertImageSliceState(0);
    await modal.clickOnLooker3d();
    await assertSingleSliceState(0, "ply");

    await modal.navigateNextSample();
    await assertSingleSliceState(1, "ply");

    await modal.navigateNextSample();
    await assertSingleSliceState(2, "ply");

    await modal.navigatePreviousSample();
    await assertSingleSliceState(1, "ply");

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
