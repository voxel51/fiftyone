/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Video annotation on a grouped dataset (image + video slice): the video slice
 * mounts the video surface, the per-slice schema filter offers each slice only
 * the fields it supports (frame detections, classification and temporal
 * detections on video; sample detections and classification on image), and
 * editing in each slice PATCHes that slice's own sample. Fixed sample ids let
 * the PATCH be checked against its slice, and the dataset is re-seeded per
 * test.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { DatasetFactory, JSONObject } from "src/shared/dataset-factory";
import { createId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-grouped-video");
const videoId = "000000000000000000000000";
const imageId = "000000000000000000000001";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

const DET = ["vehicle", "person", "road sign"];
const CLS = ["sunny", "rainy", "night"];
const EVT = ["approach", "pass", "depart"];

const ID_ATTRIBUTE = {
  name: "id",
  type: "id",
  component: "text",
  read_only: true,
};
const INDEX_ATTRIBUTE = { name: "index", type: "int", component: "text" };

const labelSchema = (
  type: string,
  classes: string[],
  extra: JSONObject[] = [],
): JSONObject => ({
  type,
  component: "dropdown",
  attributes: [ID_ATTRIBUTE, ...extra],
  classes,
});

const detection = (
  id: { $oid: string },
  extra: JSONObject = {},
): JSONObject => ({
  _id: id,
  _cls: "Detection",
  tags: [],
  label: "vehicle",
  bounding_box: [0.25, 0.25, 0.4, 0.4],
  index: 1,
  ...extra,
});

/**
 * One group: the default `video` slice (sample 0) with a per-frame tracked
 * detection plus sample-level detections/classification/events, and the
 * `image` slice with a sample-level detection + classification. The video
 * slice's sample-level detection must be filtered out of its annotate schema.
 */
const seedDataset = (datasetFactory: typeof DatasetFactory) => {
  const instance = { _id: createId(), _cls: "Instance" };
  return datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      { name: "video", mediaType: "video", videoOptions: { frameRate: 5 } },
      {
        name: "image",
        mediaType: "image",
        imageOptions: { width: 64, height: 64, fillColor: "#a03050" },
      },
    ],
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
      detections: "Detections",
      classification: "Classification",
      events: "TemporalDetections",
    },
    labelSchemas: {
      "frames.detections": labelSchema("detections", DET, [INDEX_ATTRIBUTE]),
      detections: labelSchema("detections", DET, [INDEX_ATTRIBUTE]),
      classification: labelSchema("classification", CLS),
      events: labelSchema("temporaldetections", EVT),
    },
    withSampleData: ({ slice, numFrames }, { createId }) => {
      const sample: JSONObject = {
        detections: { _cls: "Detections", detections: [detection(createId())] },
      };
      if (slice === "image") {
        sample.classification = {
          _id: createId(),
          _cls: "Classification",
          tags: [],
          label: "rainy",
        };
        return sample;
      }
      const n = numFrames ?? 0;
      const a = Math.max(1, Math.floor(n / 3));
      const b = Math.max(a + 1, Math.floor((2 * n) / 3));
      const event = (label: string, support: [number, number]): JSONObject => ({
        _id: createId(),
        _cls: "TemporalDetection",
        tags: [],
        label,
        support,
      });
      sample.classification = {
        _id: createId(),
        _cls: "Classification",
        tags: [],
        label: "sunny",
      };
      sample.events = {
        _cls: "TemporalDetections",
        detections: [
          event("approach", [1, a]),
          event("pass", [a + 1, b]),
          event("depart", [b + 1, n]),
        ],
      };
      return sample;
    },
    withFrameData: (_, { createId }) => ({
      detections: {
        _cls: "Detections",
        detections: [
          detection(createId(), {
            bounding_box: [0.3, 0.3, 0.2, 0.2],
            instance,
          }),
        ],
      },
    }),
    sampleFrames: true,
  });
};

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
  await seedDataset(datasetFactory);
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  // serial describe shares one page; close any modal a prior test left open so
  // openFirstSample's grid click below isn't intercepted
  await modal.close({ ignoreError: true });
});

/**
 * Open the first group (its default slice is `video`) and enter annotate mode
 * on the video surface. Opening from the grid (vs a deep link) loads the full
 * group so its slice membership resolves — the annotation slice selector needs
 * it.
 */
const enterVideoAnnotate = async (grid: GridPom, modal: ModalPom) => {
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe.serial("grouped video annotation", () => {
  test("the video slice mounts the video annotation surface", async ({
    grid,
    modal,
  }) => {
    // gating + surface mount: entering annotate on a grouped video slice must
    // reach the video surface (not fall back to the image renderer) and must
    // not throw on store registration
    await enterVideoAnnotate(grid, modal);
  });

  test("the video slice offers frame + classification + temporal schemas, not sample detections", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await expect
      .poll(() => modal.videoAnnotate.listedLabelPaths())
      .toEqual(
        expect.arrayContaining([
          "frames.detections",
          "classification",
          "events",
        ]),
      );

    // the sample-level `detections` field is filtered out on a video slice
    // (spatial sample-level labels live in `frames.*` on video)
    expect(await modal.videoAnnotate.listedLabelPaths()).not.toContain(
      "detections",
    );
  });

  test("the image slice offers sample detections + classification, not frame or temporal schemas", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.waitForLighterReady();

    await expect
      .poll(() => modal.videoAnnotate.listedLabelPaths())
      .toEqual(expect.arrayContaining(["detections", "classification"]));

    const paths = await modal.videoAnnotate.listedLabelPaths();
    expect(paths).not.toContain("frames.detections");
    expect(paths).not.toContain("events");
  });

  test("the annotation slice selector offers both the video and image slices", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    const slices = (
      await modal.sidebar.annotate.getAvailableAnnotationSlices()
    ).map((s) => s.trim());
    expect(slices).toContain("image");
    expect(slices).toContain("video");
  });

  test("editing on the video slice writes to the video sample", async ({
    grid,
    modal,
    page,
  }) => {
    // the sample-scope guard: selecting + editing a track on a grouped video
    // slice drives the exact path that regressed (surface actions resolving the
    // sample), and the autosave must PATCH the VIDEO sample — not the image one.
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await enterVideoAnnotate(grid, modal);

    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.selectLabel("vehicle");
    // the editor opened => select() didn't throw resolving its sample scope
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    const patch = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    const response = await patch;

    // scoped to the video sample
    expect(response.url()).toContain(videoId);
    expect(response.url()).not.toContain(imageId);
    await expect
      .poll(async () =>
        Number(await modal.sidebar.edit.getFieldValue("position.x")),
      )
      .toBeCloseTo(0.5, 4);

    expect(pageErrors).toEqual([]);
  });

  test("editing on the image slice writes to the image sample", async ({
    grid,
    modal,
  }) => {
    await enterVideoAnnotate(grid, modal);

    await modal.sidebar.annotate.selectAnnotationSlice("image");
    await modal.waitForLighterReady();

    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.selectLabel("vehicle");
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    const patch = modal.sidebar.annotate.waitForPatch();
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    const response = await patch;

    // scoped to the image sample
    expect(response.url()).toContain(imageId);
    expect(response.url()).not.toContain(videoId);
  });
});
