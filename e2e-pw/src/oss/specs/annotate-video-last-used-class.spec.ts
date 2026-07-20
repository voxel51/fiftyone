/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Last-used class on the video surface: after setting a drawn frame detection's
 * class, the NEXT drawn box defaults to that class — not the schema's first
 * class. Exercises last-used resolution in the frame namespace (the field is
 * `frames.detections`), the companion to the 2D last-used-class spec.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-last-used");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
  // classes: ["vehicle", "person", "road sign"] — "vehicle" is the schema
  // default, so a draw that defaults to "person" proves last-used drove it.
  await videoAnnotateSDK.seed({ datasetName, videoPaths: [clip] });
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
