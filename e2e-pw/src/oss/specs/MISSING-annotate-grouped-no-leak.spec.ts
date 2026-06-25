/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Grouped (multi-sample) annotation: the sidebar label list must follow the
 * SELECTED annotation slice and show only THAT slice's labels. Each slice is a
 * distinct sample doc, so the engine federates by `ref.sample` and the sidebar
 * resolves the active sample via `useActiveAnnotationSampleId`. This pins the
 * cross-slice no-leak the grouped-modal work fixed (labels of one slice bleeding
 * onto another).
 *
 * A 2D+3D group (one image slice + two 3D slices) is required to meaningfully
 * exercise the fix: `useActiveAnnotationSampleId` only diverges from `modalId`
 * via the `useThreeDSceneSampleId` discriminator, which is `undefined` in a
 * 2D-only group — so a pure-2D group has nothing 3D-specific to federate. Each
 * slice carries a DISTINCT detection count so a leak (a slice showing another's
 * labels) changes the asserted count. The image slice carries 2D detections; the
 * 3D slices carry cuboids (`fo.Detection` with location/dimensions/rotation).
 */
import fs from "node:fs";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-no-leak");

/**
 * slice → { media, seeded detection count }. Distinct, non-zero counts make a
 * cross-slice leak change the asserted count. `image` is the default 2D slice;
 * `mesh` and `cloud` are 3D slices carrying cuboids.
 */
const SLICES = {
  image: { media: "image", count: 2 },
  mesh: { media: "3d", count: 1 },
  cloud: { media: "3d", count: 3 },
} as const;
type SliceName = keyof typeof SLICES;
const SLICE_NAMES = Object.keys(SLICES) as SliceName[];

const imgPath = `/tmp/${datasetName}-image.png`;
const cubePlyPath = `/tmp/${datasetName}-cube.ply`;
const cloudPlyPath = `/tmp/${datasetName}-cloud.ply`;
const meshScenePath = `/tmp/${datasetName}-mesh.fo3d`;
const cloudScenePath = `/tmp/${datasetName}-cloud.fo3d`;
const TEMP_FILE_PATHS = [
  imgPath,
  cubePlyPath,
  cloudPlyPath,
  meshScenePath,
  cloudScenePath,
];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(
  async ({ annotateSDK, fiftyoneLoader, foWebServer, mediaFactory }) => {
    await foWebServer.startWebServer();

    mediaFactory.createImage({
      outputPath: imgPath,
      width: 320,
      height: 240,
      fillColor: "#264653",
      watermarkString: "image",
      hideLogs: true,
    });
    mediaFactory.createPly({ outputPath: cubePlyPath, shape: "cube" });
    mediaFactory.createPly({
      outputPath: cloudPlyPath,
      shape: "point-cloud",
      numPoints: 216,
    });
    mediaFactory.createFo3d({
      outputPath: meshScenePath,
      plyPath: cubePlyPath,
    });
    mediaFactory.createFo3d({
      outputPath: cloudScenePath,
      plyPath: cloudPlyPath,
    });

    // One group; the image slice carries 2D detections, the two 3D slices carry
    // cuboids. Boxes/cuboids are offset so they don't overlap (cosmetic — the
    // counts are what matter).
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.media as fom

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="image")
dataset._doc.group_media_types = {
    "image": fom.IMAGE,
    "mesh": fom.THREE_D,
    "cloud": fom.THREE_D,
}
dataset.save()
dataset.persistent = True


def image_dets(n):
    return fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                bounding_box=[0.05 + 0.1 * j, 0.4, 0.08, 0.2],
            )
            for j in range(n)
        ]
    )


def cuboid_dets(n):
    return fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                location=[0.6 * j, 0.0, 0.0],
                dimensions=[1.0, 1.0, 1.0],
                rotation=[0.0, 0.0, 0.0],
            )
            for j in range(n)
        ]
    )


group = fo.Group()
samples = [
    fo.Sample(
        filepath="${imgPath}",
        group=group.element("image"),
        detections=image_dets(${SLICES.image.count}),
    ),
    fo.Sample(
        filepath="${meshScenePath}",
        media_type="3d",
        group=group.element("mesh"),
        detections=cuboid_dets(${SLICES.mesh.count}),
    ),
    fo.Sample(
        filepath="${cloudScenePath}",
        media_type="3d",
        group=group.element("cloud"),
        detections=cuboid_dets(${SLICES.cloud.count}),
    ),
]
dataset.add_samples(samples)
  `);

    await annotateSDK.updateLabelSchema(datasetName, "detections", {
      type: "detections",
      classes: ["cat", "dog"],
      attributes: [],
      component: "dropdown",
    });
    await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
  }
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

  TEMP_FILE_PATHS.forEach((filePath) => {
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      void error;
    }
  });
});

test.describe.serial(
  "grouped 2D+3D annotation — sidebar follows the slice",
  () => {
    test.beforeEach(async ({ page, fiftyoneLoader }) => {
      await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    });

    test("each slice's label list shows only its own labels (no cross-slice leak)", async ({
      grid,
      modal,
    }) => {
      await grid.openFirstSample();
      await modal.sidebar.switchMode("annotate");

      // Walk every slice, then revisit in reverse — the count must stay each
      // slice's OWN count throughout. A leak (one slice's labels appearing on
      // another) would show the wrong count. Switching the annotation slice
      // re-federates the active sample (and, for a 3D slice, focuses + loads its
      // scene), so poll the count to absorb the async reload.
      const visit = async (slice: SliceName) => {
        await modal.sidebar.annotate.selectAnnotationSlice(slice);
        await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(
          slice
        );
        await expect
          .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
            timeout: 20_000,
          })
          .toBe(SLICES[slice].count);
      };

      for (const slice of SLICE_NAMES) {
        await visit(slice);
      }

      for (const slice of [...SLICE_NAMES].reverse()) {
        await visit(slice);
      }
    });
  }
);
