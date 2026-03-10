import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("grouped-fo3d-direct3d");
const sharedFo3dMeshPath = `/tmp/grouped-fo3d-direct3d-${datasetName}-mesh.ply`;
const sharedFo3dPointCloudPath = `/tmp/grouped-fo3d-direct3d-${datasetName}-cloud.ply`;
const groupSpecs = [1, 2, 3].map((index) => ({
  scene: `scene-${index}`,
  imagePath: `/tmp/grouped-fo3d-direct3d-${datasetName}-${index}.png`,
  fo3dLeftPath: `/tmp/grouped-fo3d-direct3d-${datasetName}-${index}-left.fo3d`,
  fo3dRightPath: `/tmp/grouped-fo3d-direct3d-${datasetName}-${index}-right.fo3d`,
  pcdAs3dPath: `/tmp/grouped-fo3d-direct3d-${datasetName}-${index}.pcd`,
  imageName: `scene-${index}-image`,
  fo3dLeftName: `scene-${index}-fo3d-left`,
  fo3dRightName: `scene-${index}-fo3d-right`,
  pcdAs3dName: `scene-${index}-pcd-as-3d`,
  offset: index * 0.2,
}));

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

  mediaFactory.createPly({
    outputPath: sharedFo3dMeshPath,
    shape: "cube",
    color: [255, 196, 96],
  });
  mediaFactory.createPly({
    outputPath: sharedFo3dPointCloudPath,
    shape: "point-cloud",
    numPoints: 216,
    color: [96, 208, 255],
  });

  await Promise.all(
    groupSpecs.map((spec, index) =>
      mediaFactory.createBlankImage({
        outputPath: spec.imagePath,
        width: 320,
        height: 240,
        fillColor: ["#3d405b", "#264653", "#6d597a"][index],
        watermarkString: spec.scene,
        hideLogs: true,
      })
    )
  );

  groupSpecs.forEach((spec, index) => {
    mediaFactory.createPcd({
      outputPath: spec.pcdAs3dPath,
      shape: index === 2 ? "diagonal" : "cube",
      numPoints: index === 2 ? 15 : 216,
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
        bounding_box=[0.18, 0.22, 0.38, 0.42],
        confidence=0.9,
    )

def make_3d_detection(label, offset):
    return fo.Detection(
        label=label,
        location=[offset, 0.1, 0.0],
        dimensions=[0.85, 0.65, 0.55],
        rotation=[0.0, offset, 0.12],
        confidence=0.97,
    )

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="image")
seed_group_media_types(
    dataset,
    {
        "image": fom.IMAGE,
        "fo3d_left": fom.THREE_D,
        "fo3d_right": fom.THREE_D,
        "pcd_as_3d": fom.THREE_D,
    },
)
dataset.persistent = True

samples = []
for spec in specs:
    left_scene = fo.Scene()
    left_mesh = fo.PlyMesh("left_mesh", "${sharedFo3dMeshPath}")
    left_mesh.position = [spec["offset"], 0.0, 0.0]
    left_mesh.scale = 0.8
    left_scene.add(left_mesh)
    left_scene.write(spec["fo3dLeftPath"])

    right_scene = fo.Scene()
    right_cloud = fo.PlyMesh(
        "right_cloud",
        "${sharedFo3dPointCloudPath}",
        is_point_cloud=True,
    )
    right_cloud.position = [spec["offset"] + 0.4, 0.0, 0.0]
    right_scene.add(right_cloud)
    right_scene.write(spec["fo3dRightPath"])

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
    fo3d_left = fo.Sample(
        filepath=spec["fo3dLeftPath"],
        media_type="3d",
        group=group.element("fo3d_left"),
        name=spec["fo3dLeftName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[
                make_3d_detection(
                    f'{spec["scene"]}-fo3d-left',
                    spec["offset"],
                )
            ]
        ),
    )
    fo3d_right = fo.Sample(
        filepath=spec["fo3dRightPath"],
        media_type="3d",
        group=group.element("fo3d_right"),
        name=spec["fo3dRightName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[
                make_3d_detection(
                    f'{spec["scene"]}-fo3d-right',
                    spec["offset"] + 0.15,
                )
            ]
        ),
    )
    pcd_as_3d = fo.Sample(
        filepath=spec["pcdAs3dPath"],
        media_type="3d",
        group=group.element("pcd_as_3d"),
        name=spec["pcdAs3dName"],
        scene=spec["scene"],
        detections=fo.Detections(
            detections=[
                make_3d_detection(
                    f'{spec["scene"]}-pcd-as-3d',
                    spec["offset"] + 0.3,
                )
            ]
        ),
    )

    samples.extend([image, fo3d_left, fo3d_right, pcd_as_3d])

dataset.add_samples(samples)
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("grouped fo3d and direct 3d", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("keeps one active fo3d scene while composing direct 3d slices", async ({
    grid,
    modal,
  }) => {
    const seenGroupIndices = new Set<number>();

    const assertFo3dOnlyState = async (
      index: number,
      expectedSlice: "fo3d_left" | "fo3d_right"
    ) => {
      const spec = groupSpecs[index];
      const expectedName =
        expectedSlice === "fo3d_left" ? spec.fo3dLeftName : spec.fo3dRightName;

      if (!seenGroupIndices.has(index)) {
        await modal.looker3dControls.waitForAllAssetsLoaded();
        seenGroupIndices.add(index);
      }

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

    const assertFo3dAndDirectState = async (
      index: number,
      waitForAssets = true
    ) => {
      const spec = groupSpecs[index];

      if (waitForAssets) {
        await modal.looker3dControls.waitForAllAssetsLoaded();
      }

      await modal.assert.verifyModalSamplePluginTitle(
        "fo3d_right and pcd_as_3d",
        { pinned: true }
      );
      await modal.looker3dControls.assert.verifySliceSelectorLabel("2 slices");
      await modal.sidebar.assert.verifySidebarEntryTexts({
        "fo3d_right-group.name": "fo3d_right",
        "pcd_as_3d-group.name": "pcd_as_3d",
        "fo3d_right-name": spec.fo3dRightName,
        "pcd_as_3d-name": spec.pcdAs3dName,
        "fo3d_right-scene": spec.scene,
        "pcd_as_3d-scene": spec.scene,
      });
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);
    };

    const navigateMixedState = async (
      direction: "forward" | "backward",
      expectedIndex: number
    ) => {
      const spec = groupSpecs[expectedIndex];

      await modal.getSampleNavigation(direction).click();
      await modal.waitForSampleLoadDomAttribute(true);
      await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
        "fo3d_right-name": spec.fo3dRightName,
        "pcd_as_3d-name": spec.pcdAs3dName,
      });
    };

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.looker3dControls.waitForAllAssetsLoaded();
    seenGroupIndices.add(0);

    await modal.assert.verifyModalSamplePluginTitle("image", { pinned: true });
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_left");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "group.name": "image",
      name: groupSpecs[0].imageName,
      scene: groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);

    await modal.clickOnLooker3d();
    await assertFo3dOnlyState(0, "fo3d_left");
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_left");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left");
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right", false);
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d", false);
    await modal.looker3dControls.closeSliceSelector();

    await modal.toggleLooker3dSlice("fo3d_right");
    await assertFo3dOnlyState(0, "fo3d_right");
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_right");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left", false);
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right");
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d", false);
    await modal.looker3dControls.closeSliceSelector();

    await modal.toggleLooker3dSlice("pcd_as_3d");
    await assertFo3dAndDirectState(0);
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left", false);
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right");
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d");
    await modal.looker3dControls.closeSliceSelector();

    await navigateMixedState("forward", 1);
    await assertFo3dAndDirectState(1);
    seenGroupIndices.add(1);

    await navigateMixedState("forward", 2);
    await assertFo3dAndDirectState(2);
    seenGroupIndices.add(2);

    await navigateMixedState("backward", 1);
    await assertFo3dAndDirectState(1, false);

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
