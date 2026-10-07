/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Temporal-detection membership on the video surface: the sidebar lists a
 * sample-level TD only while the playhead is inside its `support` span and
 * re-derives as the playhead moves. The three seeded events split the clip
 * into thirds, so each lists only within its own third.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-temporal");
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // 20 frames @ 10fps; events split into thirds:
  // approach [1,6], pass [7,13], depart [14,20].
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
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe.serial("video temporal-detection membership", () => {
  test("the sidebar lists a temporal detection only inside its support", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    const va = modal.videoAnnotate;

    // three TD interval rows on the timeline regardless of the playhead
    await va.assert.temporalTrackCount(3);

    const stepForward = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await va.stepForward();
      }
    };

    // initial frame is inside "approach" [1,6]
    await va.assert.labelListed("approach");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("depart", false);

    // step into the "pass" third [7,13]
    await stepForward(8);
    await va.assert.labelListed("pass");
    await va.assert.labelListed("approach", false);
    await va.assert.labelListed("depart", false);

    // step into the "depart" third [14,20]
    await stepForward(8);
    await va.assert.labelListed("depart");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("approach", false);
  });
});
