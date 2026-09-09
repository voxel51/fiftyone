/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 3D cuboids must not leak into a 2D camera slice's editable sidebar when the
 * 3D viewer is pinned. When a group's default slice is 3D, `EnsureGroupSample`
 * pins the 3D viewer and swaps the selection to the first non-3D slice, so the
 * scene stays pinned while the active annotation slice is 2D. The sidebar must
 * resolve the active sample from the rendering surface, not the pinned scene,
 * or the scene's cuboids appear as editable rows on the camera slice.
 *
 * The default slice is the 3D `mesh` (one "dog" cuboid); `image` carries two
 * "cat" detections. On open the selection lands on `image` with the 3D viewer
 * pinned: assert the image sidebar shows only its two detections (no leak), and
 * as a positive control that selecting `mesh` does surface its cuboid.
 */
import fs from "node:fs";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { AnnotateSDK } from "src/oss/fixtures/annotate-sdk";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-pin-leak");

const imgPath = `/tmp/${datasetName}-image.png`;
const cubePlyPath = `/tmp/${datasetName}-cube.ply`;
const meshScenePath = `/tmp/${datasetName}-mesh.fo3d`;
const TEMP_FILE_PATHS = [imgPath, cubePlyPath, meshScenePath];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/**
 * One group: a 3D `mesh` slice (default) carrying a single "dog" cuboid, and an
 * `image` slice carrying two "cat" 2D detections. The default being 3D is what
 * drives `EnsureGroupSample` to pin the 3D viewer + select the image slice on
 * open — the leak precondition.
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
dataset.add_group_field("group", default="mesh")
dataset._doc.group_media_types = {"image": fom.IMAGE, "mesh": fom.THREE_D}
dataset.save()
dataset.persistent = True

group = fo.Group()
samples = [
    fo.Sample(
        filepath="${imgPath}",
        group=group.element("image"),
        detections=fo.Detections(detections=[
            fo.Detection(label="cat", bounding_box=[0.05, 0.4, 0.08, 0.2]),
            fo.Detection(label="cat", bounding_box=[0.2, 0.4, 0.08, 0.2]),
        ]),
    ),
    fo.Sample(
        filepath="${meshScenePath}",
        media_type="3d",
        group=group.element("mesh"),
        detections=fo.Detections(detections=[
            fo.Detection(
                label="dog",
                location=[6.0, 6.0, 0.0],
                dimensions=[1.0, 1.0, 1.0],
                rotation=[0.0, 0.0, 0.0],
            ),
        ]),
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
  mediaFactory.createFo3d({ outputPath: meshScenePath, plyPath: cubePlyPath });
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

test.describe.serial("grouped 2D+3D annotation — 3D pin does not leak", () => {
  test.beforeEach(async ({ annotateSDK, fiftyoneLoader, modal, page }) => {
    await seedDataset(fiftyoneLoader, annotateSDK);
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await modal.close({ ignoreError: true });
  });

  test("3D cuboids do not appear as editable labels on the camera slice", async ({
    grid,
    modal,
  }) => {
    // Default slice is the 3D mesh, so EnsureGroupSample pins the 3D viewer and
    // selects the image slice. The 3D scene is the pinned/current sample even
    // though the active annotation slice is the 2D image slice. Let the slice
    // swap + 2D-viewer visibility settle before entering Annotate so the modal
    // opens on the 2D camera surface (the leak precondition) deterministically.
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");

    // The image slice's sidebar must reflect ITS OWN two detections — never the
    // pinned 3D scene's cuboid. A leak would show count 1 with the "dog" cuboid.
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(2);
    await modal.annotate3d.assert.labelListed("dog", false);
    expect(await modal.annotate3d.listedLabels()).toEqual(["cat", "cat"]);

    // Explicitly selecting the image slice keeps it clean (no cuboid resurfaces).
    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("image");
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(2);
    await modal.annotate3d.assert.labelListed("dog", false);
  });

  test("selecting the 3D slice still surfaces its cuboid (positive control)", async ({
    grid,
    modal,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");

    // Selecting the 3D mesh slice as the annotation target must list its cuboid.
    await modal.sidebar.annotate.selectAnnotationSlice("mesh");
    await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice("mesh");
    await modal.annotate3d.waitForSurface();
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
        timeout: 20_000,
      })
      .toBe(1);
    await modal.annotate3d.assert.labelListed("dog", true);
  });
});
