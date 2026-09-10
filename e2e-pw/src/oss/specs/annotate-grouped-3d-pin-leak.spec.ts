/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * 3D cuboids must not leak into a 2D camera slice's editable sidebar while the
 * 3D viewer is pinned: with a 3D default slice, `EnsureGroupSample` pins the
 * viewer and selects the first non-3D slice, and the sidebar must resolve the
 * active sample from the rendering surface. The default `mesh` slice carries
 * one "dog" cuboid and `image` two "cat" detections, so the image sidebar must
 * list only the two while selecting `mesh` surfaces the cuboid.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { DatasetFactory } from "src/shared/dataset-factory";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-pin-leak");

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
const seedDataset = (datasetFactory: typeof DatasetFactory) =>
  datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      { name: "mesh", mediaType: "3d" },
      {
        name: "image",
        mediaType: "image",
        imageOptions: {
          width: 320,
          height: 240,
          fillColor: "#264653",
          watermarkString: "image",
          hideLogs: true,
        },
      },
    ],
    schema: { detections: "Detections" },
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat", "dog"],
        attributes: [],
        component: "dropdown",
      },
    },
    withSampleData: ({ slice }, { createId }) => ({
      detections: {
        _cls: "Detections",
        detections:
          slice === "image"
            ? [
                {
                  _id: createId(),
                  _cls: "Detection",
                  tags: [],
                  label: "cat",
                  bounding_box: [0.05, 0.4, 0.08, 0.2],
                },
                {
                  _id: createId(),
                  _cls: "Detection",
                  tags: [],
                  label: "cat",
                  bounding_box: [0.2, 0.4, 0.08, 0.2],
                },
              ]
            : [
                {
                  _id: createId(),
                  _cls: "Detection",
                  tags: [],
                  label: "dog",
                  location: [6, 6, 0],
                  dimensions: [1, 1, 1],
                  rotation: [0, 0, 0],
                },
              ],
      },
    }),
  });

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("grouped 2D+3D annotation — 3D pin does not leak", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await seedDataset(datasetFactory);
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
    await modal.close({ ignoreError: true });
  });

  test("3D cuboids do not appear as editable labels on the camera slice", async ({
    grid,
    modal,
  }) => {
    // the default slice is the 3D mesh, so EnsureGroupSample pins the viewer and
    // selects the image slice; let that settle before entering Annotate so the
    // modal opens on the 2D surface (the leak precondition)
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
