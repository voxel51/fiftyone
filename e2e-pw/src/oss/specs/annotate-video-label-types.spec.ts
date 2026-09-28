/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Rendering of non-box labels on the video surface: a masked detection track
 * and a polyline track across two active `frames.*` fields both list in the
 * sidebar (proving every active per-frame field registers with its real label
 * type) and the mask shows in the label menu. Create round-trips live in
 * `annotate-video-label-types-create.spec.ts`.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-label-types",
);

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // sample 0: a masked detection track (vehicle) + a polyline track (person),
  // each a single instance present on every frame.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
      "frames.polylines": "Polylines",
      "frames.polylines.polylines.instance": "Instance",
      "frames.polylines.polylines.keyframe": "BooleanField",
      "frames.polylines.polylines.propagation": "DictField",
      events: "TemporalDetections",
    },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "tags", type: "list<str>", component: "text" },
          { name: "confidence", type: "float", component: "text" },
          { name: "index", type: "int", component: "text" },
          { name: "mask_path", type: "str", component: "text" },
        ],
      },
      "frames.polylines": {
        type: "polylines",
        component: "dropdown",
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "index", type: "int", component: "text" },
        ],
      },
      events: {
        type: "temporaldetections",
        component: "dropdown",
        classes: ["approach", "pass", "depart"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
        ],
      },
    },
    // three events split the clip into thirds
    withSampleData: ({ numFrames }, { label }) => {
      const a = Math.max(1, Math.floor(numFrames / 3));
      const b = Math.max(a + 1, Math.floor((2 * numFrames) / 3));
      return {
        events: label.temporalDetections([
          label.temporalDetection({ label: "approach", support: [1, a] }),
          label.temporalDetection({ label: "pass", support: [a + 1, b] }),
          label.temporalDetection({
            label: "depart",
            support: [b + 1, numFrames],
          }),
        ]),
      };
    },
    withFrameData: (_, { label, mask }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
          mask: mask(20, 20),
        }),
      ]),
      polylines: label.polylines([
        label.polyline({
          label: "person",
          points: [
            [
              [0.2, 0.2],
              [0.5, 0.2],
              [0.35, 0.5],
            ],
          ],
          closed: true,
          filled: false,
          index: 2,
          instance: label.instance("person-2"),
        }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked video sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe.serial("video non-box label rendering", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("existing detection and polyline labels both render in the sidebar", async ({
    modal,
  }) => {
    // The polyline only lists if `frames.polylines` was registered + seeded
    // into the engine alongside `frames.detections` — i.e. the multi-field seed.
    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.assert.labelListed("person");
  });

  test("the polyline appears as its own timeline track", async ({ modal }) => {
    // Two instances on two fields (detection index=1, polyline index=2) → two
    // object tracks. Single-field track building would show only the detection.
    await modal.videoAnnotate.assert.objectTrackCount(2);
  });

  test("an existing instance mask renders on the detection", async ({
    modal,
  }) => {
    await modal.videoAnnotate.selectLabel("vehicle");
    await modal.sidebar.edit.assert.hasMask(true);
  });

  test("an existing polyline is selectable and opens its editor", async ({
    modal,
  }) => {
    await modal.videoAnnotate.selectLabel("person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
  });

  test("selecting a polyline from its timeline track drives the other surfaces", async ({
    modal,
  }) => {
    // Read the polyline's instance id from the list first (selecting a label
    // swaps the list for its editor), then start on a different label so the
    // timeline click must change the selection.
    const instanceId = await modal.videoAnnotate.labelRowId("person");

    // the tracks drawer starts closed; pin the row so the timeline click below
    // has a visible target
    await modal.videoAnnotate.pinTrack(instanceId);

    await modal.videoAnnotate.selectLabel("vehicle");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");

    // Clicking a timeline row writes engine interaction; the editor follows the
    // anchor. The row must address the polyline's OWN field path (`frames.polylines`)
    // — a row keyed to the detections field would select nothing, leaving the
    // editor on "vehicle".
    await modal.videoAnnotate.clickTrack(instanceId);
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
  });

  test("the annotate surface exposes mask + polyline create modes", async ({
    page,
  }) => {
    // The video surface used to show only Detection; masks (Segmentation mode)
    // and polylines are now ungated alongside it.
    await expect(page.getByTestId("detection-mode")).toBeVisible();
    await expect(page.getByTestId("segmentation-mode")).toBeVisible();
    await expect(page.getByTestId("polyline-mode")).toBeVisible();
  });

  test("polyline create mode activates on the video surface", async ({
    modal,
    page,
  }) => {
    // The mode only enters (active flips true) when an active polyline field
    // exists and the button isn't disabled — i.e. create is wired for video.
    await modal.sidebar.annotate.polylineMode();
    await expect(page.getByTestId("polyline-mode")).toHaveAttribute(
      "data-cy-active",
      "true",
    );
  });
});
