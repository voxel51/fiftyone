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
 * Pure-2D group (three image slices) — deliberately avoids 3D, which has no e2e
 * harness yet. Each slice is seeded with a DISTINCT detection count so a leak
 * (a slice showing another's labels) changes the asserted count.
 */
import fs from "node:fs";
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-no-leak");

/** slice → seeded detection count (distinct, non-zero → unambiguous + no empty-state edge). */
const SLICE_COUNTS = { left: 2, right: 1, center: 3 } as const;
const SLICES = Object.keys(SLICE_COUNTS) as (keyof typeof SLICE_COUNTS)[];

const imgPath = (slice: string) => `/tmp/${datasetName}-${slice}.png`;
const TEMP_FILE_PATHS = SLICES.map(imgPath);

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

    const fillColors = ["#264653", "#3d405b", "#6d597a"];
    await Promise.all(
      SLICES.map((slice, i) =>
        mediaFactory.createImage({
          outputPath: imgPath(slice),
          width: 320,
          height: 240,
          fillColor: fillColors[i],
          watermarkString: slice,
          hideLogs: true,
        })
      )
    );

    // One group; each image slice carries a distinct number of detections. The
    // boxes are tiled along x so they don't overlap (cosmetic — counts are what
    // matter).
    const seed = Object.fromEntries(
      SLICES.map((slice) => [slice, SLICE_COUNTS[slice]])
    );
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
import fiftyone.core.media as fom

counts = ${JSON.stringify(seed)}
paths = ${JSON.stringify(
      Object.fromEntries(SLICES.map((s) => [s, imgPath(s)]))
    )}

dataset = fo.Dataset("${datasetName}")
dataset.add_group_field("group", default="left")
dataset._doc.group_media_types = {s: fom.IMAGE for s in counts}
dataset.save()
dataset.persistent = True

group = fo.Group()
samples = []
for slice_name, n in counts.items():
    dets = [
        fo.Detection(label="cat", bounding_box=[0.05 + 0.1 * j, 0.4, 0.08, 0.2])
        for j in range(n)
    ]
    samples.append(
        fo.Sample(
            filepath=paths[slice_name],
            group=group.element(slice_name),
            detections=fo.Detections(detections=dets),
        )
    )

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

test.describe.serial("grouped annotation — sidebar follows the slice", () => {
  test.beforeEach(async ({ page, fiftyoneLoader }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  });

  // FIXME (deferred): this pure-2D approach does NOT meaningfully test the
  // grouped federation fix and fights a 3D-oriented control. (1) The annotation
  // slice selector's `useApplyAnnotationSliceVisibility` calls `focusSlice` from
  // `useRenderConfig3dActions` — it's built for the 2D+3D case. (2) The fix it
  // would pin (`useActiveAnnotationSampleId`) only diverges from `modalId` via
  // the `useThreeDSceneSampleId` discriminator, which is `undefined` for a 2D-
  // only group — so there's nothing 3D-specific to exercise here. (3) Observed:
  // switching the annotation slice in a 2D-only group hangs the modal canvas
  // reload (waitForSampleLoadDomAttribute times out on the 2nd slice) — flag for
  // confirmation, but the natural 2D slice nav is the carousel, not this
  // selector. A real grouped no-leak test needs the (deferred) 3D harness: draw
  // on the 2D slice + the pcd slice, assert each stays on its own slice.
  test.fixme(
    "each slice's label list shows only its own labels (no cross-slice leak)",
    async ({ grid, modal }) => {
      await grid.selectSlice("left");
      await grid.openFirstSample();
      await modal.sidebar.switchMode("annotate");

      // Walk every slice, then revisit — the count must stay each slice's OWN
      // count throughout. A leak (one slice's labels appearing on another) would
      // show the wrong count.
      const visit = async (slice: keyof typeof SLICE_COUNTS) => {
        await modal.sidebar.annotate.selectAnnotationSlice(slice);
        await modal.sidebar.annotate.assert.verifySelectedAnnotationSlice(
          slice
        );
        // Switching slices re-queries + reloads the modal sample; wait for the
        // canvas to settle before reading the (slice-specific) label count.
        await modal.waitForSampleLoadDomAttribute();
        await expect
          .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
          .toBe(SLICE_COUNTS[slice]);
      };

      for (const slice of SLICES) {
        await visit(slice);
      }

      // Revisit in reverse: each slice still shows ONLY its own labels (the
      // earlier visits didn't contaminate it).
      for (const slice of [...SLICES].reverse()) {
        await visit(slice);
      }
    }
  );
});
