import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("grouped-point-cloud-ply");
const groupSpecs = [1, 2, 3].map((index) => ({
  scene: `scene-${index}`,
  imageName: `scene-${index}-image`,
  pcdName: `scene-${index}-pcd`,
  plyName: `scene-${index}-ply`,
  offset: index * 0.15,
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
    location: [offset, 0.0, 0.1],
    dimensions: [0.9, 0.7, 0.5],
    rotation: [0.0, offset, 0.1],
    confidence: 0.96,
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
          fillColor: ["#22577a", "#2a9d8f", "#8f5a3c"][index],
          watermarkString: groupSpecs[index].scene,
          hideLogs: true,
        }),
      },
      {
        name: "pcd",
        mediaType: "point-cloud",
        pcdOptions: (index) =>
          index === 1
            ? { shape: "diagonal", numPoints: 18 }
            : { shape: "cube", numPoints: 216 },
      },
      {
        name: "ply",
        mediaType: "3d",
        sceneOptions: (index) => ({
          ply: {
            shape: "cube",
            color: (
              [
                [255, 155, 64],
                [96, 200, 164],
                [118, 168, 255],
              ] as [number, number, number][]
            )[index],
          },
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
      const { scene, imageName, pcdName, plyName, offset } =
        groupSpecs[groupIndex];
      const samples: Record<string, [string, object]> = {
        image: [
          imageName,
          {
            label: `${scene}-image`,
            bounding_box: [0.22, 0.24, 0.35, 0.4],
            confidence: 0.91,
          },
        ],
        pcd: [pcdName, cuboid(`${scene}-pcd`, offset)],
        ply: [plyName, cuboid(`${scene}-ply`, offset + 0.2)],
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

test.describe.serial("grouped point-cloud and ply", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("reconciles point-cloud and ply slices across grouped navigation", async ({
    grid,
    modal,
  }) => {
    /**
     * Run `step` to show `expectedSlice` of group `index`, then check it.
     * `sceneLoads` when the step (re)mounts the 3D scene.
     */
    const assertSingleSliceState = async (
      index: number,
      expectedSlice: "image" | "pcd" | "ply",
      step: () => Promise<unknown>,
      sceneLoads = false,
    ) => {
      const spec = groupSpecs[index];
      const expectedName =
        expectedSlice === "image"
          ? spec.imageName
          : expectedSlice === "pcd"
            ? spec.pcdName
            : spec.plyName;
      const entries = {
        "group.name": expectedSlice,
        name: expectedName,
        scene: spec.scene,
      };

      await modal.sidebar.afterEntries(entries, () =>
        sceneLoads ? modal.looker3dControls.afterAllAssetsLoaded(step) : step(),
      );

      await modal.assert.verifyModalSamplePluginTitle(expectedSlice, {
        pinned: true,
      });
      await modal.sidebar.assert.verifySidebarEntryTexts(entries);
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
    };

    const assertImageSliceState = async (
      index: number,
      step: () => Promise<unknown>,
    ) => {
      const spec = groupSpecs[index];
      const entries = {
        "group.name": "image",
        name: spec.imageName,
        scene: spec.scene,
      };

      await modal.sidebar.afterEntries(entries, step);
      await modal.assert.verifyModalSamplePluginTitle("image", {
        pinned: true,
      });
      await modal.sidebar.assert.verifySidebarEntryTexts(entries);
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
    };

    const bothSlices = {
      "pcd-group.name": "pcd",
      "ply-group.name": "ply",
      "pcd-name": groupSpecs[0].pcdName,
      "ply-name": groupSpecs[0].plyName,
      "pcd-scene": groupSpecs[0].scene,
      "ply-scene": groupSpecs[0].scene,
    };

    await modal.looker3dControls.afterAllAssetsLoaded(() =>
      modal.afterSampleLoaded(() => grid.openFirstSample(), true),
    );

    await modal.assert.verifyModalSamplePluginTitle("image", { pinned: true });
    await modal.looker3dControls.assert.verifySliceSelectorLabel("pcd");
    await modal.sidebar.assert.verifySidebarEntryTexts({
      "group.name": "image",
      name: groupSpecs[0].imageName,
      scene: groupSpecs[0].scene,
    });
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);

    await assertSingleSliceState(0, "pcd", () =>
      modal.sampleCanvas3d.click(0.5, 0.5),
    );
    await modal.looker3dControls.assert.verifySliceSelectorLabel("pcd");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd");
    await modal.looker3dControls.assert.verifySliceChecked("ply", false);
    await modal.looker3dControls.closeSliceSelector();

    await modal.sidebar.afterEntries(bothSlices, () =>
      modal.looker3dControls.afterAllAssetsLoaded(() =>
        modal.toggleLooker3dSlice("ply"),
      ),
    );
    await modal.assert.verifyModalSamplePluginTitle("pcd and ply", {
      pinned: true,
    });
    await modal.looker3dControls.assert.verifySliceSelectorLabel(
      "all 3D slices",
    );
    await modal.sidebar.assert.verifySidebarEntryTexts(bothSlices);
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd");
    await modal.looker3dControls.assert.verifySliceChecked("ply");
    await modal.looker3dControls.closeSliceSelector();

    await assertImageSliceState(0, () =>
      modal.groupSampleCanvas.click(0.5, 0.5),
    );
    await modal.sidebar.afterEntries(bothSlices, () =>
      modal.sampleCanvas3d.click(0.5, 0.5),
    );
    await modal.assert.verifyModalSamplePluginTitle("pcd and ply", {
      pinned: true,
    });
    await modal.sidebar.assert.verifySidebarEntryTexts(bothSlices);
    await modal.sidebar.assert.verifySidebarFieldCount("detections", 2);

    await assertSingleSliceState(
      0,
      "ply",
      () => modal.toggleLooker3dSlice("pcd"),
      true,
    );
    await modal.looker3dControls.assert.verifySliceSelectorLabel("ply");
    await modal.looker3dControls.openSliceSelector();
    await modal.looker3dControls.assert.verifySliceChecked("pcd", false);
    await modal.looker3dControls.assert.verifySliceChecked("ply");
    await modal.looker3dControls.closeSliceSelector();

    await assertImageSliceState(0, () =>
      modal.groupSampleCanvas.click(0.5, 0.5),
    );
    await assertSingleSliceState(0, "ply", () =>
      modal.sampleCanvas3d.click(0.5, 0.5),
    );

    const next = () => modal.navigateNextSample();
    await assertSingleSliceState(1, "ply", next, true);
    await assertSingleSliceState(2, "ply", next, true);
    await assertSingleSliceState(
      1,
      "ply",
      () => modal.navigatePreviousSample(),
      true,
    );

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
