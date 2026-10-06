import { test as base, expect } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("direct3d-flat-parity");
// a bare PCD, a bare PLY and another bare PCD, each loaded as "3d" media
const sampleSpecs = [
  {
    name: "flat-pcd-1",
    kind: "pcd",
    asset: { pcd: { shape: "cube", numPoints: 216 } },
    offset: 0.0,
  },
  {
    name: "flat-ply-2",
    kind: "ply",
    asset: { ply: { shape: "cube" } },
    offset: 0.35,
  },
  {
    name: "flat-pcd-3",
    kind: "pcd",
    asset: { pcd: { shape: "diagonal", numPoints: 12 } },
    offset: 0.7,
  },
] as const;

// each sample's file, set once the dataset exists
let filepaths: string[];

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
  const samples = await datasetFactory.createDataset({
    mediaType: "3d",
    datasetName,
    numSamples: sampleSpecs.length,
    sceneOptions: (index) => sampleSpecs[index].asset,
    schema: {
      name: "StringField",
      shape_kind: "StringField",
      detections: "Detections",
      "detections.detections.location": "ListField<FloatField>",
      "detections.detections.dimensions": "ListField<FloatField>",
      "detections.detections.rotation": "ListField<FloatField>",
    },
    withSampleData: ({ index }, { label }) => {
      const { name, kind, offset } = sampleSpecs[index];
      return {
        name,
        shape_kind: kind,
        detections: label.detections([
          label.detection({
            label: `${name}-detection`,
            location: [offset, 0.0, 0.15],
            dimensions: [0.8, 0.6, 0.5],
            rotation: [0.0, offset, 0.0],
            confidence: 0.95,
          }),
        ]),
      };
    },
  });
  filepaths = samples.map(({ filepath }) => filepath);
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

    /** Run `step` to show sample `specIndex`, then check it */
    const assertFlatSample = async (
      specIndex: number,
      step: () => Promise<unknown>,
    ) => {
      const spec = sampleSpecs[specIndex];

      if (!seenSampleIndices.has(specIndex)) {
        await modal.looker3dControls.afterAllAssetsLoaded(step);
        seenSampleIndices.add(specIndex);
      } else {
        await step();
      }

      expect(await modal.looker3d.isVisible()).toBe(true);
      await modal.looker3dControls.assert.verifySliceSelectorHidden();
      await modal.sidebar.assert.verifySidebarEntryTexts({
        name: spec.name,
        shape_kind: spec.kind,
      });
      await modal.sidebar.assert.verifySidebarFieldCount("detections", 1);
      expect(await modal.sidebar.getSampleFilepath(false)).toBe(
        filepaths[specIndex].split("/").at(-1),
      );
    };

    await assertFlatSample(0, () => grid.openFirstSample());
    await assertFlatSample(1, () => modal.navigateNextSample());
    await assertFlatSample(2, () => modal.navigateNextSample());
    await assertFlatSample(1, () => modal.navigatePreviousSample());

    // TODO: add canvas screenshot assertions once 3D modal screenshots stabilize.
  });
});
