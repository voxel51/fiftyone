/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Grouped annotation: the sidebar label list and the persist write must follow
 * the selected annotation slice, since each slice is its own sample doc. A
 * 2D+3D group is required because `useActiveAnnotationSampleId` only diverges
 * from `modalId` through the 3D-scene discriminator, and each slice carries a
 * distinct detection count so a leak changes the asserted count.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { DatasetFactory, JSONObject } from "src/shared/dataset-factory";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-no-leak");

/**
 * slice → { media, seeded detection count }, distinct and non-zero so a
 * cross-slice read leak changes the asserted count. `image` is the default 2D
 * slice; `mesh` and `cloud` are 3D slices carrying cuboids.
 */
const SLICES = {
  image: { media: "image", count: 2 },
  mesh: { media: "3d", count: 1 },
  cloud: { media: "3d", count: 3 },
} as const;
type SliceName = keyof typeof SLICES;
const SLICE_NAMES = Object.keys(SLICES) as SliceName[];

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/**
 * (Re)create the grouped dataset per test: one group whose image slice carries
 * 2D detections and whose two 3D slices carry cuboids, each slice a distinct
 * count. The cuboids sit off the scene origin so the CREATE test's center draw
 * raycasts a clean z=0 plane instead of selecting one.
 */
const seedDataset = (datasetFactory: typeof DatasetFactory) =>
  datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
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
      { name: "mesh", mediaType: "3d" },
      {
        name: "cloud",
        mediaType: "3d",
        sceneOptions: { meshes: [{ shape: "point-cloud", numPoints: 216 }] },
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
    withSampleData: ({ slice }, { createId }) => {
      const { media, count } = SLICES[slice as SliceName];
      const detection = (j: number): JSONObject =>
        media === "image"
          ? {
              _id: createId(),
              _cls: "Detection",
              tags: [],
              label: "cat",
              bounding_box: [0.05 + 0.1 * j, 0.4, 0.08, 0.2],
            }
          : {
              _id: createId(),
              _cls: "Detection",
              tags: [],
              label: "cat",
              location: [6 + 2 * j, 6, 0],
              dimensions: [1, 1, 1],
              rotation: [0, 0, 0],
            };
      return {
        detections: {
          _cls: "Detections",
          detections: Array.from({ length: count }, (_, j) => detection(j)),
        },
      };
    },
  });

/**
 * The persisted detection classes per group slice (sorted, so the comparison
 * is order-independent), read off the annotate sidebar of a brand-new browser
 * context. Confirms an edit landed only on its own slice's sample.
 */
const expectPersistedSliceClasses = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  expected: Record<SliceName, string[]>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const eventUtils = new EventUtils(freshPage);
    const grid = new GridPom(freshPage, eventUtils);
    const modal = new ModalPom(freshPage, eventUtils);
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName);
    await freshPage.evaluate(() =>
      window.localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
    );
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute(true);
    await modal.sidebar.switchMode("annotate");
    for (const slice of SLICE_NAMES) {
      await modal.sidebar.annotate.selectAnnotationSlice(slice);
      await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(slice);
      if (SLICES[slice].media === "3d") {
        await modal.annotate3d.waitForSurface();
      }
      // switching the annotation slice re-federates the active sample (and
      // loads a 3D slice's scene), so settle on the count first
      await expect
        .poll(() => modal.sidebar.annotate.getActiveLabelsCount(), {
          timeout: 20_000,
        })
        .toBe(expected[slice].length);
      expect((await modal.annotate3d.listedLabels()).sort()).toEqual(
        expected[slice],
      );
    }
  } finally {
    await context.close();
  }
};

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("grouped 2D+3D annotation — federation by slice", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await seedDataset(datasetFactory);
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

    // walk every slice, then revisit in reverse: the count must stay each slice's
    // own count throughout. Switching the slice re-federates the active sample
    // (and loads a 3D scene), so poll the count to absorb the reload.
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
    browser,
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
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.annotate.waitForSavesSettled();

    // only the image sample changed (now one dog + one cat); 3D slices untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "dog"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });
  });

  test("creating a detection on the 2D image slice persists only to that slice", async ({
    browser,
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

    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.annotate.waitForSavesSettled();

    // the new "dog" detection lands on the image sample only — 3D slices untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat", "dog"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });
  });

  test("editing a cuboid on the 3D mesh slice persists only to that slice", async ({
    browser,
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
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.annotate.waitForSavesSettled();

    // only the mesh sample changed; image + cloud untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: ["dog"],
      cloud: ["cat", "cat", "cat"],
    });
  });

  test("creating a cuboid on the 3D mesh slice persists only to that slice", async ({
    browser,
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

    // keep the seeded cuboid so the detections field stays enabled (an emptied
    // slice drops the field and the `cuboid-mode` toolbar with it); it sits off
    // the origin, so a center draw after the top view lands on a clean z=0 plane
    await modal.annotate3d.enterCuboidMode();
    await modal.looker3dControls.setTopView();
    await modal.annotate3d.toggleCreateCuboid();
    await modal.annotate3d.assert.createCuboidActive(true);
    await modal.annotate3d.drawCuboid([
      [0.4, 0.4],
      [0.6, 0.4],
      [0.6, 0.6],
    ]);

    // the freshly-drawn cuboid auto-selects with its edit form open; give it a
    // distinct class so the create is unambiguous, then let it autosave
    await modal.sidebar.edit.selectFieldChoice("label", "dog");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "dog");
    await modal.sidebar.annotate.waitForSavesSettled();

    // the created "dog" cuboid lands on the mesh sample only — the seeded "cat"
    // stays and image + cloud are untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: ["cat", "dog"],
      cloud: ["cat", "cat", "cat"],
    });
  });

  test("deleting a cuboid on the 3D mesh slice persists, and undo/redo round-trip — all only on that slice", async ({
    browser,
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
    let saved = modal.sidebar.annotate.waitForPatch();
    await modal.annotate3d.deleteSelected();
    await saved;

    // the delete persists to the mesh sample only — image + cloud untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: [],
      cloud: ["cat", "cat", "cat"],
    });

    // undo restores the mesh cuboid
    saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.undo();
    await saved;
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });

    // redo re-applies the delete
    saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.redo();
    await saved;
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: [],
      cloud: ["cat", "cat", "cat"],
    });
  });

  test("deleting a label on the 2D image slice persists, and undo/redo round-trip — all only on that slice", async ({
    browser,
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
    let saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.deleteLabel();
    await saved;

    // the delete persists to the image sample only — 3D slices untouched
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });

    // undo restores the deleted detection (still only on the image sample)
    saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.undo();
    await saved;
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat", "cat"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });

    // redo re-applies the delete (still only on the image sample)
    saved = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.redo();
    await saved;
    await expectPersistedSliceClasses(browser, fiftyoneLoader, {
      image: ["cat"],
      mesh: ["cat"],
      cloud: ["cat", "cat", "cat"],
    });
  });
});
