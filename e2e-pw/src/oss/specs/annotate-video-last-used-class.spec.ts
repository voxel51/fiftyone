/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Last-used class on the video surface: after setting a drawn frame detection's
 * class, the next drawn box defaults to that class rather than the schema's
 * first. The companion to the 2D spec, resolved in the `frames.detections`
 * namespace.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-last-used");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // classes: ["vehicle", "person", "road sign"] — "vehicle" is the schema
  // default, so a draw that defaults to "person" proves last-used drove it.
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
    // present-but-empty on every frame, so the first draw's patch can append
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked video sample. */
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

/** Draw a detection box across the given relative corners (detection mode). */
const drawBox = async (
  modal: ModalPom,
  from: [number, number],
  to: [number, number],
) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(from[0], from[1]);
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(to[0], to[1]);
  await modal.sampleCanvas.up();
};

test.describe.serial("video annotation last-used class", () => {
  test("a changed class becomes the default for the next drawn box", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // draw the first box and switch its class to the non-default "person"
    await drawBox(modal, [0.55, 0.55], [0.78, 0.78]);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await modal.sidebar.edit.exitToList();

    // the next drawn box defaults to the last-used class ("person"), not the
    // schema's first class ("vehicle")
    await drawBox(modal, [0.1, 0.1], [0.3, 0.3]);
    await expect
      .poll(() => modal.sidebar.edit.getCurrentField())
      .toBe("frames.detections");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
  });
});
