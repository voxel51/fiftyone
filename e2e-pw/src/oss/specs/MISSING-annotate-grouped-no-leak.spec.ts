/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Grouped (multi-sample) annotation: the sidebar label list AND the persist
 * write must follow the SELECTED annotation slice. Each slice is a distinct
 * sample doc, so the engine federates by `ref.sample` and the sidebar resolves
 * the active sample via `useActiveAnnotationSampleId`. This pins the cross-slice
 * no-leak the grouped-modal work fixed — labels of one slice neither LISTING on
 * another (read federation) nor being WRITTEN to another on edit (persist
 * federation).
 *
 * A 2D+3D group (one image slice + two 3D slices) is required to meaningfully
 * exercise the fix: `useActiveAnnotationSampleId` only diverges from `modalId`
 * via the `useThreeDSceneSampleId` discriminator, which is `undefined` in a
 * 2D-only group — so a pure-2D group has nothing 3D-specific to federate. Each
 * slice carries a DISTINCT detection count so a read leak changes the asserted
 * count; per-slice class edits + DB readbacks confirm a write lands only on its
 * own slice. The image slice carries 2D detections; the 3D slices carry cuboids
 * (`fo.Detection` with location/dimensions/rotation).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { AnnotateSDK } from "src/oss/fixtures/annotate-sdk";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-no-leak");

/**
 * slice → { media, seeded detection count }. Distinct, non-zero counts make a
 * cross-slice read leak change the asserted count. `image` is the default 2D
 * slice; `mesh` and `cloud` are 3D slices carrying cuboids.
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

/**
 * (Re)create the grouped dataset: one group whose image slice carries 2D
 * detections and whose two 3D slices carry cuboids, each slice a distinct
 * count. Re-seeded per test so the mutating edit cases each start clean. The
 * media files are created once in `beforeAll`.
 */
const seedDataset = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  annotateSDK: AnnotateSDK,
) => {
  await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.media as fom

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

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
    # offset well off the scene origin so a center canvas draw (the CREATE
    # test) raycasts a clean z=0 plane instead of selecting a seeded cuboid;
    # the looker frames the scene mesh at the origin, so these project to the
    # periphery. Sidebar-driven select/edit/delete is position-agnostic.
    return fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                location=[6.0 + 2.0 * j, 6.0, 0.0],
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
};

/**
 * Reads back the persisted detection classes per group slice (sorted, so the
 * comparison is order-independent). Used to confirm a class edit landed only on
 * its own slice's sample. Mirrors the temp-file readback pattern of the 3D SDK
 * (each call spawns a python process — poll with a generous timeout).
 */
const readSliceClasses = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
): Promise<Record<string, string[]>> => {
  const resultFile = path.join(
    os.tmpdir(),
    `grouped-slice-classes-${datasetName}.json`,
  );

  await fiftyoneLoader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
result = {}
for slice_name in dataset.group_slices:
    dataset.group_slice = slice_name
    sample = dataset.first()
    field = sample.get_field("detections") if sample is not None else None
    labels = (
        [d.label for d in field.detections]
        if field is not None and getattr(field, "detections", None)
        else []
    )
    result[slice_name] = sorted(labels)

with open("${resultFile}", "w") as f:
    json.dump(result, f)
`);

  const raw = fs.readFileSync(resultFile, "utf-8");
  fs.unlinkSync(resultFile);
  return JSON.parse(raw) as Record<string, string[]>;
};

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
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
  mediaFactory.createFo3d({ outputPath: meshScenePath, plyPath: cubePlyPath });
  mediaFactory.createFo3d({
    outputPath: cloudScenePath,
    plyPath: cloudPlyPath,
  });
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

test.describe.serial("grouped 2D+3D annotation — federation by slice", () => {
  test.beforeEach(async ({ annotateSDK, fiftyoneLoader, modal, page }) => {
    await seedDataset(fiftyoneLoader, annotateSDK);
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    // suppress the one-time 3D annotation tips popup — it overlays the
    // looker3d action bar (bottom-left in multiview) and intercepts the
    // set-top-view click the cuboid-create draw depends on
    await page.evaluate(() =>
      window.localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
    );
    // serial describe shares one page; a modal left open by the prior test
    // would intercept the grid click below
    await modal.close({ ignoreError: true });
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
      await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(slice);
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

  // Per-slice PERSIST federation: a class edit made while a given annotation
  // slice is selected must be written to THAT slice's sample only — the other
  // slices' samples are untouched. A write leak would mutate the wrong sample.
  test("editing a label on the 2D image slice persists only to that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("image");
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(2);

    // change the first of the image slice's two detections cat -> dog
    await modal.annotate3d.selectLabel("cat");
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await saved;

    // only the image sample changed (now one dog + one cat); 3D slices untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "dog"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });
  });

  test("creating a detection on the 2D image slice persists only to that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("image");
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(2);

    // draw a new detection clear of the two seeded boxes (which sit at low x),
    // then assign it a distinct class so the create is unambiguous
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.6, 0.6, "crosshair");
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.82, 0.82);
    await modal.sampleCanvas.up();

    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await saved;

    // the new "dog" detection lands on the image sample only — 3D slices untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat", "dog"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });
  });

  test("editing a cuboid on the 3D mesh slice persists only to that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");

    // select the mesh slice as the annotation target — in annotate mode this
    // mounts the 3D looker + its annotation surface (the grouped 3D path); the
    // surface must finish loading before the cuboid is selectable
    await modal.sidebar.annotate.selectAnnotationSlice("mesh");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("mesh");
    await modal.annotate3d.waitForSurface();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(1);

    // select the mesh cuboid and change its class
    await modal.annotate3d.selectLabel("cat");
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await saved;

    // only the mesh sample changed; image + cloud untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: ["dog"],
        cloud: ["cat", "cat", "cat"],
      });
  });

  test("creating a cuboid on the 3D mesh slice persists only to that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.selectAnnotationSlice("mesh");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("mesh");
    await modal.annotate3d.waitForSurface();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(1);

    // keep the seeded cuboid (so the detections field stays enabled — the
    // `cuboid-mode` toolbar mounts on field activation, and an emptied slice
    // drops the field out of the Explore sidebar). The seeded cuboids sit OFF
    // the scene origin (see `cuboid_dets`), so a center draw raycasts a clean
    // z=0 plane instead of selecting the existing cuboid.
    //
    // Enter cuboid mode, look straight down Z so the three draw clicks land
    // deterministically on the z=0 plane, then draw a cuboid at center.
    await modal.annotate3d.enterCuboidMode();
    await modal.looker3dControls.setTopView();
    // let the top-view camera animation settle before drawing — the three
    // draw clicks raycast against the live camera, so a still-animating
    // (perspective) camera yields no planar cuboid
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await modal.page.waitForTimeout(1000);
    await modal.annotate3d.toggleCreateCuboid();
    await modal.annotate3d.assert.createCuboidActive(true);
    await modal.annotate3d.drawCuboid([
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
    ]);

    // the freshly-drawn cuboid auto-selects with its edit form open; give it a
    // distinct class so the create is unambiguous, then let it autosave
    const saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await saved;

    // the created "dog" cuboid lands on the mesh sample only — the seeded "cat"
    // stays and image + cloud are untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: ["cat", "dog"],
        cloud: ["cat", "cat", "cat"],
      });
  });

  test("deleting a cuboid on the 3D mesh slice persists, and undo/redo round-trip — all only on that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.selectAnnotationSlice("mesh");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("mesh");
    await modal.annotate3d.waitForSurface();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(1);

    // delete the mesh cuboid via the 3D annotation toolbar
    await modal.annotate3d.selectLabel("cat");
    await modal.annotate3d.deleteSelected();

    // the delete persists to the mesh sample only — image + cloud untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: [],
        cloud: ["cat", "cat", "cat"],
      });

    // undo restores the mesh cuboid
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });

    // redo re-applies the delete
    await modal.sidebar.edit.redo();
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: [],
        cloud: ["cat", "cat", "cat"],
      });
  });

  test("deleting a label on the 2D image slice persists, and undo/redo round-trip — all only on that slice", async ({
    grid,
    modal,
    fiftyoneLoader,
  }) => {
    await grid.openFirstSample();
    await modal.sidebar.switchMode("annotate");

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("image");
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(2);

    // delete one of the image slice's two detections via the label menu
    await modal.annotate3d.selectLabel("cat");
    await modal.sidebar.edit.deleteLabel();

    // the delete persists to the image sample only — 3D slices untouched
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });

    // undo restores the deleted detection (still only on the image sample)
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat", "cat"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });

    // redo re-applies the delete (still only on the image sample)
    await modal.sidebar.edit.redo();
    await expect
      .poll(() => readSliceClasses(fiftyoneLoader), { timeout: 20_000 })
      .toEqual({
        image: ["cat"],
        mesh: ["cat"],
        cloud: ["cat", "cat", "cat"],
      });
  });
});
