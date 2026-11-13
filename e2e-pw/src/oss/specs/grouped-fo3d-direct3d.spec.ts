import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("grouped-fo3d-direct3d");
const groupSpecs = [1, 2, 3].map((index) => ({
  scene: `scene-${index}`,
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

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  const cuboid = (label: string, offset: number) => ({
    label,
    location: [offset, 0.1, 0.0],
    dimensions: [0.85, 0.65, 0.55],
    rotation: [0.0, offset, 0.12],
    confidence: 0.97,
  });
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: groupSpecs.length,
    slices: [
      {
        name: "image",
        mediaType: "image",
        imageOptions: (index) => ({
          width: 320,
          height: 240,
          fillColor: ["#3d405b", "#264653", "#6d597a"][index],
          watermarkString: groupSpecs[index].scene,
          hideLogs: true,
        }),
      },
      {
        name: "fo3d_left",
        mediaType: "3d",
        sceneOptions: (index) => ({
          meshes: [
            {
              shape: "cube",
              color: [255, 196, 96],
              name: "left_mesh",
              position: [groupSpecs[index].offset, 0.0, 0.0],
              scale: 0.8,
            },
          ],
        }),
      },
      {
        name: "fo3d_right",
        mediaType: "3d",
        sceneOptions: (index) => ({
          meshes: [
            {
              shape: "point-cloud",
              numPoints: 216,
              color: [96, 208, 255],
              name: "right_cloud",
              isPointCloud: true,
              position: [groupSpecs[index].offset + 0.4, 0.0, 0.0],
            },
          ],
        }),
      },
      {
        name: "pcd_as_3d",
        mediaType: "3d",
        sceneOptions: (index) => ({
          pcd:
            index === 2
              ? { shape: "diagonal", numPoints: 15 }
              : { shape: "cube", numPoints: 216 },
        }),
      },
    ],
    schema: {
      name: "StringField",
      scene: "StringField",
      detections: "Detections",
      "detections.detections.location": "ListField<FloatField>",
      "detections.detections.dimensions": "ListField<FloatField>",
      "detections.detections.rotation": "ListField<FloatField>",
    },
    withSampleData: ({ groupIndex, slice }, { label }) => {
      const spec = groupSpecs[groupIndex];
      const { scene, offset } = spec;
      const samples: Record<string, [string, object]> = {
        image: [
          spec.imageName,
          {
            label: `${scene}-image`,
            bounding_box: [0.18, 0.22, 0.38, 0.42],
            confidence: 0.9,
          },
        ],
        fo3d_left: [spec.fo3dLeftName, cuboid(`${scene}-fo3d-left`, offset)],
        fo3d_right: [
          spec.fo3dRightName,
          cuboid(`${scene}-fo3d-right`, offset + 0.15),
        ],
        pcd_as_3d: [
          spec.pcdAs3dName,
          cuboid(`${scene}-pcd-as-3d`, offset + 0.3),
        ],
      };
      const [name, detection] = samples[slice];
      return {
        name,
        scene,
        detections: label.detections([label.detection({ ...detection })]),
      };
    },
  });
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
    /** Run `step` to show only `expectedSlice` of group `index`, then check it */
    const assertFo3dOnlyState = async (
      index: number,
      expectedSlice: "fo3d_left" | "fo3d_right",
      step: () => Promise<unknown>,
    ) => {
      const spec = groupSpecs[index];
      const expectedName =
        expectedSlice === "fo3d_left" ? spec.fo3dLeftName : spec.fo3dRightName;
      const entries = {
        "group.name": expectedSlice,
        name: expectedName,
        scene: spec.scene,
      };

      await modal.sidebar.afterEntries(entries, step);
      await modal.assert.verifyModalSamplePluginTitle(expectedSlice, {
        pinned: true,
      });
      await modal.sidebar.assert.verifySidebarEntryTexts(entries);
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
    };

    /**
     * Run `step` to show fo3d_right and pcd_as_3d of group `index`, then check
     * them. `sceneLoads` when the step loads the scene anew.
     */
    const assertFo3dAndDirectState = async (
      index: number,
      step: () => Promise<unknown>,
      sceneLoads = true,
    ) => {
      const spec = groupSpecs[index];
      const entries = {
        "fo3d_right-group.name": "fo3d_right",
        "pcd_as_3d-group.name": "pcd_as_3d",
        "fo3d_right-name": spec.fo3dRightName,
        "pcd_as_3d-name": spec.pcdAs3dName,
        "fo3d_right-scene": spec.scene,
        "pcd_as_3d-scene": spec.scene,
      };

      await modal.sidebar.afterEntries(entries, () =>
        sceneLoads ? modal.looker3dControls.afterAllAssetsLoaded(step) : step(),
      );
      await modal.assert.verifyModalSamplePluginTitle(
        "fo3d_right and pcd_as_3d",
        { pinned: true },
      );
      await modal.looker3dControls.assert.verifySliceSelectorLabel("2 slices");
      await modal.sidebar.assert.verifySidebarEntryTexts(entries);
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);
    };

    const navigate = (direction: "forward" | "backward") => () =>
      modal.afterSampleLoaded(
        () => modal.getSampleNavigation(direction).click(),
        true,
      );

    await modal.looker3dControls.afterAllAssetsLoaded(() =>
      modal.afterSampleLoaded(() => grid.openFirstSample(), true),
    );

    await modal.assert.verifyModalSamplePluginTitle("image", { pinned: true });
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_left");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "group.name": "image",
      name: groupSpecs[0].imageName,
      scene: groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);

    await assertFo3dOnlyState(0, "fo3d_left", () =>
      modal.sampleCanvas3d.click(0.5, 0.5),
    );
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_left");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left");
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right", false);
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d", false);
    await modal.looker3dControls.closeSliceSelector();

    await assertFo3dOnlyState(0, "fo3d_right", () =>
      modal.toggleLooker3dSlice("fo3d_right"),
    );
    await modal.looker3dControls.assert.verifySliceSelectorLabel("fo3d_right");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left", false);
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right");
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d", false);
    await modal.looker3dControls.closeSliceSelector();

    await assertFo3dAndDirectState(0, () =>
      modal.toggleLooker3dSlice("pcd_as_3d"),
    );
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_left", false);
    await modal.looker3dControls.assert.verifySliceChecked("fo3d_right");
    await modal.looker3dControls.assert.verifySliceChecked("pcd_as_3d");
    await modal.looker3dControls.closeSliceSelector();

    await assertFo3dAndDirectState(1, navigate("forward"));
    await assertFo3dAndDirectState(2, navigate("forward"));
    await assertFo3dAndDirectState(1, navigate("backward"), false);

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
