import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("sparse-fo3d-groups");
const SLICES = ["x", "y", "z"] as const;
const groupSpecs = [
  { scene: "group-1", slices: ["x", "y", "z"] },
  { scene: "group-2", slices: ["y", "z"] },
  { scene: "group-3", slices: ["z"] },
  { scene: "group-4", slices: ["x", "z"] },
].map((spec, groupIndex) => ({
  ...spec,
  samples: spec.slices.map((slice, sliceIndex) => ({
    slice,
    name: `${spec.scene}-${slice}`,
    position: [
      groupIndex * 0.45,
      sliceIndex * 0.25,
      slice === "z" ? 0.2 : 0,
    ] as [number, number, number],
    scale: 0.85 + sliceIndex * 0.1,
  })),
}));
const groupsWith = (slice: string) =>
  groupSpecs.flatMap(({ slices }, index) =>
    slices.includes(slice) ? [index] : [],
  );
const sampleOf = (groupIndex: number, slice: string) =>
  groupSpecs[groupIndex].samples.find((sample) => sample.slice === slice);

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
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: groupSpecs.length,
    slices: SLICES.map((slice) => ({
      name: slice,
      mediaType: "3d",
      groupIndices: groupsWith(slice),
      sceneOptions: (groupIndex: number) => {
        const { name, position, scale } = sampleOf(groupIndex, slice);
        return {
          meshes: [{ color: [96, 208, 255], name, position, scale }],
        };
      },
    })),
    schema: { name: "StringField", scene: "StringField" },
    withSampleData: ({ groupIndex, slice }) => ({
      name: sampleOf(groupIndex, slice).name,
      scene: groupSpecs[groupIndex].scene,
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("sparse grouped fo3d", () => {
  // the session restores an open modal into the next test's page
  test.afterEach(async ({ modal }) => {
    await modal.close({ ignoreError: true });
  });

  test.beforeEach(async ({ page, fiftyoneLoader, grid }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.selectSlice("z");
  });

  test("keeps sparse 3d modal navigation stable", async ({ grid, modal }) => {
    /** Run `step` to show `expectedSlice` of group `index`, then check it */
    const assertSingleSliceState = async (
      index: number,
      expectedSlice: "x" | "y" | "z",
      step: () => Promise<unknown>,
    ) => {
      const spec = groupSpecs[index];
      const sample = sampleOf(index, expectedSlice);

      if (!sample) {
        throw new Error(
          `Missing sample for ${spec.scene} on slice ${expectedSlice}`,
        );
      }

      const entries = {
        "group.name": expectedSlice,
        name: sample.name,
        scene: spec.scene,
      };
      await modal.sidebar.afterEntries(entries, () =>
        modal.looker3dControls.afterAllAssetsLoaded(step),
      );
      await modal.looker3dControls.assert.verifySliceSelectorLabel(
        expectedSlice,
      );
      await modal.assert.verifyHasNoViewerError();
      await modal.sidebar.assert.verifySidebarEntryTexts(entries);
    };

    await grid.assert.isEntryCountTextEqualTo(
      `${groupsWith("z").length} groups with slice`,
    );

    await assertSingleSliceState(0, "z", () =>
      modal.afterSampleLoaded(() => grid.openFirstSample(), true),
    );
    await assertSingleSliceState(0, "y", () => modal.toggleLooker3dSlice("y"));
    await assertSingleSliceState(1, "y", () => modal.navigateNextSample(true));
    await assertSingleSliceState(2, "z", () => modal.navigateNextSample(true));
    await assertSingleSliceState(3, "z", () => modal.navigateNextSample(true));
  });

  test("opens the first modal cleanly from every grid slice", async ({
    grid,
    modal,
  }) => {
    for (const slice of SLICES) {
      const entryCount = `${groupsWith(slice).length} groups with slice`;
      await grid.selectSlice(slice);
      await grid.sliceSelector.assert.verifyActiveSlice(slice);
      await grid.assert.isEntryCountTextEqualTo(entryCount);

      await modal.sidebar.afterEntries({ "group.name": slice }, () =>
        modal.looker3dControls.afterAllAssetsLoaded(() =>
          modal.afterSampleLoaded(() => grid.openFirstSample(), true),
        ),
      );
      await modal.assert.verifyHasNoViewerError();
      await modal.sidebar.assert.verifySidebarEntryText("group.name", slice);

      await modal.close();
      await modal.assert.isClosed();
    }
  });
});
