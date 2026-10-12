import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("sparse-multimodal-groups");
const groupSpecs = [
  { scene: "scene-1", slices: ["pcd"] },
  { scene: "scene-2", slices: ["left", "pcd"] },
  { scene: "scene-3", slices: ["right", "pcd"] },
  { scene: "scene-4", slices: ["left", "right", "pcd"] },
].map((spec, index) => ({
  ...spec,
  leftName: `${spec.scene}-left`,
  rightName: `${spec.scene}-right`,
  pcdName: `${spec.scene}-pcd`,
  offset: index * 0.3,
}));
const IMAGE_FILL_COLORS = ["#264653", "#3d405b", "#6d597a", "#355070"];
const groupsWith = (slice: string) =>
  groupSpecs.flatMap(({ slices }, index) =>
    slices.includes(slice) ? [index] : [],
  );

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
  const image =
    (fillColor: (index: number) => string, name: (index: number) => string) =>
    (groupIndex: number) => ({
      width: 320,
      height: 240,
      fillColor: fillColor(groupIndex),
      watermarkString: name(groupIndex),
      hideLogs: true,
    });
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: groupSpecs.length,
    slices: [
      {
        name: "left",
        mediaType: "image",
        groupIndices: groupsWith("left"),
        imageOptions: image(
          (index) => IMAGE_FILL_COLORS[index],
          (index) => groupSpecs[index].leftName,
        ),
      },
      {
        name: "right",
        mediaType: "image",
        groupIndices: groupsWith("right"),
        imageOptions: image(
          (index) => IMAGE_FILL_COLORS[(index + 1) % IMAGE_FILL_COLORS.length],
          (index) => groupSpecs[index].rightName,
        ),
      },
      {
        name: "pcd",
        mediaType: "3d",
        groupIndices: groupsWith("pcd"),
        sceneOptions: (index) => ({
          meshes: [
            {
              color: [255, 196, 96],
              name: groupSpecs[index].pcdName,
              position: [groupSpecs[index].offset, 0.0, 0.1],
              scale: 0.9,
            },
          ],
        }),
      },
    ],
    schema: { name: "StringField", scene: "StringField" },
    withSampleData: ({ groupIndex, slice }) => {
      const spec = groupSpecs[groupIndex];
      const names: Record<string, string> = {
        left: spec.leftName,
        right: spec.rightName,
        pcd: spec.pcdName,
      };
      return { name: names[slice], scene: spec.scene };
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("sparse multimodal groups", () => {
  // the session restores an open modal into the next test's page
  test.afterEach(async ({ modal }) => {
    await modal.close({ ignoreError: true });
  });

  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("opens a pcd-only group from the pcd grid slice without throwing", async ({
    grid,
    modal,
  }) => {
    await grid.selectSlice("pcd");
    await grid.sliceSelector.assert.verifyActiveSlice("pcd");
    await grid.assert.isEntryCountTextEqualTo(
      `${groupsWith("pcd").length} groups with slice`,
    );

    const first = {
      "group.name": "pcd",
      name: groupSpecs[0].pcdName,
      scene: groupSpecs[0].scene,
    };
    await modal.sidebar.afterEntries(first, () =>
      modal.looker3dControls.afterAllAssetsLoaded(() => grid.openFirstSample()),
    );
    await modal.assert.verify3dRendererVisible();
    await modal.assert.verifyHasNoViewerError();
    await modal.sidebar.assert.verifySidebarEntryTexts(first);

    const second = {
      "group.name": "pcd",
      name: groupSpecs[1].pcdName,
      scene: groupSpecs[1].scene,
    };
    await modal.sidebar.afterEntries(second, () =>
      modal.looker3dControls.afterAllAssetsLoaded(() =>
        modal.navigateNextSample(true),
      ),
    );
    await modal.assert.verifyHasNoViewerError();
    await modal.sidebar.assert.verifySidebarEntryTexts(second);
  });

  test("opens the first modal cleanly from every grid slice", async ({
    grid,
    modal,
  }) => {
    type Viewer = { is3dSlice: boolean; mode: "annotate" | "explore" };

    /** Run `step` and resolve once the viewer it shows has loaded */
    const afterViewer = (
      { is3dSlice, mode }: Viewer,
      step: () => Promise<unknown>,
    ) =>
      is3dSlice
        ? modal.looker3dControls.afterAllAssetsLoaded(step)
        : mode === "annotate"
          ? modal.afterLighterReady(step)
          : modal.afterSampleLoaded(step, true);

    const assertModalHasNoViewerError = async ({ is3dSlice, mode }: Viewer) => {
      if (is3dSlice) {
        await modal.assert.verify3dRendererVisible();
      } else if (mode === "annotate") {
        await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
      }

      await modal.assert.verifyHasNoViewerError();
    };
    const sliceExpectations = [
      {
        slice: "left",
        entryCount: `${groupsWith("left").length} groups with slice`,
        expectedName: groupSpecs[1].leftName,
        expectedScene: groupSpecs[1].scene,
        expectedAnnotationSlices: ["left", "pcd"],
      },
      {
        slice: "right",
        entryCount: `${groupsWith("right").length} groups with slice`,
        expectedName: groupSpecs[2].rightName,
        expectedScene: groupSpecs[2].scene,
        expectedAnnotationSlices: ["right", "pcd"],
      },
      {
        slice: "pcd",
        entryCount: `${groupsWith("pcd").length} groups with slice`,
        expectedName: groupSpecs[0].pcdName,
        expectedScene: groupSpecs[0].scene,
        expectedAnnotationSlices: ["pcd"],
      },
    ];

    for (const {
      slice,
      entryCount,
      expectedName,
      expectedScene,
      expectedAnnotationSlices,
    } of sliceExpectations) {
      await grid.selectSlice(slice);
      await grid.sliceSelector.assert.verifyActiveSlice(slice);
      await grid.assert.isEntryCountTextEqualTo(entryCount);

      const is3dSlice = slice === "pcd";
      const explore: Viewer = { is3dSlice, mode: "explore" };
      const annotate: Viewer = { is3dSlice, mode: "annotate" };
      const opened = {
        "group.name": slice,
        name: expectedName,
        scene: expectedScene,
      };

      await modal.sidebar.afterEntries(opened, () =>
        afterViewer(explore, () => grid.openFirstSample()),
      );
      await assertModalHasNoViewerError(explore);
      await modal.sidebar.assert.verifySidebarEntryTexts(opened);

      for (let round = 0; round < 2; round++) {
        await afterViewer(annotate, () => modal.sidebar.switchMode("annotate"));
        await modal.sidebar.annotate.assert.verifyAvailableAnnotationSlices(
          expectedAnnotationSlices,
        );
        await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(
          slice,
        );
        await assertModalHasNoViewerError(annotate);

        await modal.sidebar.afterEntries({ "group.name": slice }, () =>
          afterViewer(explore, () => modal.sidebar.switchMode("explore")),
        );
        await assertModalHasNoViewerError(explore);
        await modal.sidebar.assert.verifySidebarEntryText("group.name", slice);
      }

      await modal.close();
      await modal.assert.isClosed();
    }
  });
});
