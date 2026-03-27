import fs from "node:fs";
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("jagged-fo3d-groups");
const sharedMeshPath = `/tmp/jagged-fo3d-groups-${datasetName}-mesh.ply`;
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
    path: `/tmp/jagged-fo3d-groups-${datasetName}-${spec.scene}-${slice}.fo3d`,
    position: [groupIndex * 0.45, sliceIndex * 0.25, slice === "z" ? 0.2 : 0],
    scale: 0.85 + sliceIndex * 0.1,
  })),
}));
const TEMP_FILE_PATHS = [
  sharedMeshPath,
  ...groupSpecs.flatMap((spec) => spec.samples.map(({ path }) => path)),
];

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
    outputPath: sharedMeshPath,
    shape: "cube",
    color: [96, 208, 255],
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

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="x")
seed_group_media_types(
    dataset,
    {
        "x": fom.THREE_D,
        "y": fom.THREE_D,
        "z": fom.THREE_D,
    },
)
dataset.persistent = True

samples = []
for spec in specs:
    group = fo.Group()

    for sample_spec in spec["samples"]:
        scene = fo.Scene()
        mesh = fo.PlyMesh(sample_spec["name"], "${sharedMeshPath}")
        mesh.position = sample_spec["position"]
        mesh.scale = sample_spec["scale"]
        scene.add(mesh)
        scene.write(sample_spec["path"])

        samples.append(
            fo.Sample(
                filepath=sample_spec["path"],
                media_type="3d",
                group=group.element(sample_spec["slice"]),
                name=sample_spec["name"],
                scene=spec["scene"],
            )
        )

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

  TEMP_FILE_PATHS.forEach((filePath) => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      void error;
    }
  });
});

test.describe.serial("jagged grouped fo3d", () => {
  test.beforeEach(async ({ page, fiftyoneLoader, grid }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await grid.selectSlice("z");
  });

  test("keeps jagged 3d modal navigation stable", async ({ grid, modal }) => {
    const assertSingleSliceState = async (
      index: number,
      expectedSlice: "x" | "y" | "z"
    ) => {
      const spec = groupSpecs[index];
      const sample = spec.samples.find(({ slice }) => slice === expectedSlice);

      if (!sample) {
        throw new Error(
          `Missing sample for ${spec.scene} on slice ${expectedSlice}`
        );
      }

      await modal.looker3dControls.waitForAllAssetsLoaded();
      await modal.looker3dControls.assert.verifySliceSelectorLabel(
        expectedSlice
      );
      await modal.assert.verifyHasNoViewerError();
      await modal.sidebar.assert.waitUntilSidebarEntryTextEqualsMultiple({
        "group.name": expectedSlice,
        name: sample.name,
        scene: spec.scene,
      });
    };

    await grid.assert.isEntryCountTextEqualTo("4 groups with slice");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await assertSingleSliceState(0, "z");

    await modal.toggleLooker3dSlice("y");
    await assertSingleSliceState(0, "y");

    await modal.navigateNextSample(true);
    await assertSingleSliceState(1, "y");

    await modal.navigateNextSample(true);
    await assertSingleSliceState(2, "z");

    await modal.navigateNextSample(true);
    await assertSingleSliceState(3, "z");
  });

  test("opens the first modal cleanly from every grid slice", async ({
    grid,
    modal,
  }) => {
    const sliceExpectations = [
      { slice: "x", entryCount: "2 groups with slice" },
      { slice: "y", entryCount: "2 groups with slice" },
      { slice: "z", entryCount: "4 groups with slice" },
    ] as const;

    for (const { slice, entryCount } of sliceExpectations) {
      await grid.selectSlice(slice);
      await grid.sliceSelector.assert.verifyActiveSlice(slice);
      await grid.assert.isEntryCountTextEqualTo(entryCount);

      await grid.openFirstSample();
      await modal.waitForSampleLoadDomAttribute(true);
      await modal.looker3dControls.waitForAllAssetsLoaded();
      await modal.assert.verifyHasNoViewerError();
      await modal.sidebar.assert.waitUntilSidebarEntryTextEquals(
        "group.name",
        slice
      );

      await modal.close();
      await modal.assert.isClosed();
    }
  });
});
