import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("direct3d-flat-parity");
const sampleSpecs = [
  {
    name: "flat-pcd-1",
    filepath: `/tmp/direct3d-flat-${datasetName}-1.pcd`,
    kind: "pcd",
    offset: 0.0,
  },
  {
    name: "flat-ply-2",
    filepath: `/tmp/direct3d-flat-${datasetName}-2.ply`,
    kind: "ply",
    offset: 0.35,
  },
  {
    name: "flat-pcd-3",
    filepath: `/tmp/direct3d-flat-${datasetName}-3.pcd`,
    kind: "pcd",
    offset: 0.7,
  },
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

  mediaFactory.createPcd({
    outputPath: sampleSpecs[0].filepath,
    shape: "cube",
    numPoints: 216,
  });
  mediaFactory.createPly({
    outputPath: sampleSpecs[1].filepath,
    shape: "cube",
  });
  mediaFactory.createPcd({
    outputPath: sampleSpecs[2].filepath,
    shape: "diagonal",
    numPoints: 12,
  });

  await fiftyoneLoader.executePythonCode(`
import json

import fiftyone as fo

specs = json.loads(r'''${JSON.stringify(sampleSpecs)}''')

def make_detection(label, offset):
    return fo.Detection(
        label=label,
        location=[offset, 0.0, 0.15],
        dimensions=[0.8, 0.6, 0.5],
        rotation=[0.0, offset, 0.0],
        confidence=0.95,
    )

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True

samples = []
for spec in specs:
    sample = fo.Sample(
        filepath=spec["filepath"],
        media_type="3d",
        name=spec["name"],
        shape_kind=spec["kind"],
    )
    sample["detections"] = fo.Detections(
        detections=[make_detection(f'{spec["name"]}-detection', spec["offset"])]
    )
    samples.append(sample)

dataset.add_samples(samples)
  `);
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("flat direct 3d parity", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  test("pcd and ply samples keep the same DOM invariants across navigation", async ({
    grid,
    modal,
  }) => {
    const seenSampleIndices = new Set<number>();

    const assertFlatSample = async (specIndex: number) => {
      const spec = sampleSpecs[specIndex];

      if (!seenSampleIndices.has(specIndex)) {
        await modal.looker3dControls.waitForAllAssetsLoaded();
        seenSampleIndices.add(specIndex);
      }

      await expect(modal.looker3d).toBeVisible();
      await modal.looker3dControls.assert.verifySliceSelectorHidden();
      await modal.sidebar.assert.verifySidebarEntryTexts({
        name: spec.name,
        shape_kind: spec.kind,
      });
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
      expect(await modal.sidebar.getSampleFilepath(false)).toBe(
        spec.filepath.split("/").at(-1)
      );
    };

    await grid.openFirstSample();
    await assertFlatSample(0);

    await modal.navigateNextSample();
    await assertFlatSample(1);

    await modal.navigateNextSample();
    await assertFlatSample(2);

    await modal.navigatePreviousSample();
    await assertFlatSample(1);

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
