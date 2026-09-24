/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Schema-manager activation gates every annotate surface for a video dataset:
 * deactivating a field must hide it on the canvas overlays, the timeline tracks
 * and the sidebar rows, for both a per-frame field (`frames.detections`) and a
 * sample-level TemporalDetections field (`events`). Re-seeded per test with a
 * tracked `vehicle` on every frame plus the demo events over a 20-frame clip,
 * so both fields render everywhere at frame 1.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { SchemaManagerPom } from "src/oss/poms/schema-manager";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-schema-active",
);
const id = "000000000000000000000000";

const FRAME_FIELD = "frames.detections";
const TD_FIELD = "events";

const test = base.extend<{
  modal: ModalPom;
  schemaManager: SchemaManagerPom;
}>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  schemaManager: async ({ page, eventUtils }, use) => {
    await use(new SchemaManagerPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory }) => {
  // a tracked `vehicle` frame detection on every frame + the three demo TDs
  // over the 20-frame clip (approach [1,6] / pass [7,13] / depart [14,20]; the
  // playhead opens on frame 1, approach in support); both schemas active.
  // Re-seeded per test so activation edits don't leak across the serial
  // dataset.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
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
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
        }),
      ]),
    }),
  });
});

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

/** Both fields painted on every surface — the seeded starting point. */
const assertBothFieldsRendered = async (modal: ModalPom) => {
  const va = modal.videoAnnotate;
  await va.assert.canvasRendersField(FRAME_FIELD, true);
  await va.assert.canvasRendersField(TD_FIELD, true);
  await va.assert.objectTrackCount(1);
  await va.assert.temporalTrackCount(3);
  await va.assert.labelListed("vehicle", true);
  await va.assert.labelListed("approach", true);
};

test.describe.serial("video annotation schema activation gating", () => {
  test("deactivating a frame field hides its canvas overlays, timeline tracks, and sidebar rows", async ({
    fiftyoneLoader,
    modal,
    page,
    schemaManager,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await assertBothFieldsRendered(modal);

    await schemaManager.open();
    await schemaManager.deactivateField(FRAME_FIELD);
    await schemaManager.close();

    // the frame field is gone everywhere; the TD field is untouched
    await va.assert.canvasRendersField(FRAME_FIELD, false);
    await va.assert.objectTrackCount(0);
    await va.assert.labelListed("vehicle", false);

    await va.assert.canvasRendersField(TD_FIELD, true);
    await va.assert.temporalTrackCount(3);
    await va.assert.labelListed("approach", true);
  });

  test("deactivating the temporal-detection field hides its canvas overlays + timeline tracks", async ({
    fiftyoneLoader,
    modal,
    page,
    schemaManager,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await assertBothFieldsRendered(modal);

    await schemaManager.open();
    await schemaManager.deactivateField(TD_FIELD);
    await schemaManager.close();

    // the TD field is gone everywhere; the frame field is untouched
    await va.assert.canvasRendersField(TD_FIELD, false);
    await va.assert.temporalTrackCount(0);
    await va.assert.labelListed("approach", false);

    await va.assert.canvasRendersField(FRAME_FIELD, true);
    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle", true);
  });

  test("reactivating a deactivated frame field restores its overlays + tracks", async ({
    fiftyoneLoader,
    modal,
    page,
    schemaManager,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await assertBothFieldsRendered(modal);

    // deactivate, confirm it's gone from the canvas, then reactivate
    await schemaManager.open();
    await schemaManager.deactivateField(FRAME_FIELD);
    await schemaManager.close();
    await va.assert.canvasRendersField(FRAME_FIELD, false);
    await va.assert.objectTrackCount(0);

    await schemaManager.open();
    await schemaManager.activateField(FRAME_FIELD);
    await schemaManager.close();

    // the bridge re-creates and rehydrates: overlays, tracks, and rows return
    await va.assert.canvasRendersField(FRAME_FIELD, true);
    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle", true);
  });
});
