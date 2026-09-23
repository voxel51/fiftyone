/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Wheel zoom, drag pan, and the reset shortcut on the Lighter canvas, for both
 * the image and the video annotate surfaces. Each gesture must repaint the
 * canvas, and reset must return it to exactly the frame it opened with.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SampleCanvasType } from "src/oss/poms/modal/sample-canvas";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const imageDatasetName = getUniqueDatasetNameWithPrefix("annotate-zoom-pan");
const videoDatasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-zoom-pan",
);

/** Fixed ObjectId addressing the video sample (so we can deep-link the modal). */
const videoId = "000000000000000000000000";

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName: imageDatasetName,
    numSamples: 1,
    numbered: true,
  });
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName: videoDatasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
    },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["box"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
        ],
      },
    },
    // a solid frame shows no zoom; a centered box makes it visible
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({ label: "box", bounding_box: [0.25, 0.25, 0.5, 0.5] }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

/** Zoom, pan, then reset, asserting the canvas after each gesture. */
const zoomPanReset = async (modal: ModalPom, name: string) => {
  const canvas = modal.sampleCanvas;

  await canvas.assert.hasScreenshot(`${name}-initial.png`);

  // the screenshot parks the pointer at the viewport edge
  await canvas.move(0.5, 0.5);
  await canvas.zoomIn();
  await canvas.assert.hasScreenshot(`${name}-zoomed.png`);

  // start off the box: in Annotate a press on it grabs the label
  await canvas.drag(0.1, 0.9, 0.3, 0.9);
  await canvas.assert.hasScreenshot(`${name}-panned.png`);

  // reset returns to exactly the frame the canvas opened with
  await canvas.resetZoomPan();
  await canvas.assert.hasScreenshot(`${name}-initial.png`);
};

test.describe.serial("Lighter zoom and pan", () => {
  test("image: wheel zooms, drag pans, and reset restores the initial frame", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, imageDatasetName);
    await grid.openFirstSample();
    await modal.sidebar.switchMode("annotate");
    await modal.sampleCanvas.assert.is(SampleCanvasType.LIGHTER);
    await modal.waitForLighterReady();

    await zoomPanReset(modal, "image");
  });

  test("video: wheel zooms, drag pans, and reset restores the initial frame", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, videoDatasetName, {
      searchParams: new URLSearchParams({ id: videoId }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    await zoomPanReset(modal, "video");
  });
});
