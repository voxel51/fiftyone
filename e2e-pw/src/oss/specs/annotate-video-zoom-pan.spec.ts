/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Wheel zoom, drag pan, and the reset shortcut on the Lighter video surface,
 * for both a video dataset and a dynamic group of images played as a video.
 * Each gesture must move the media and its labels together, and reset must
 * return the canvas to exactly the frame it opened with.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const videoDatasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-zoom-pan",
);
const dgvaDatasetName = getUniqueDatasetNameWithPrefix(
  "annotate-dgva-zoom-pan",
);

/** Fixed ObjectId addressing the video sample (so we can deep-link the modal). */
const videoId = "000000000000000000000000";

// a solid frame shows no zoom; a centered box makes it visible
const BOX = [0.25, 0.25, 0.5, 0.5];

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
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({ label: "box", bounding_box: BOX }),
      ]),
    }),
  });
  await datasetFactory.createDataset({
    mediaType: "image",
    datasetName: dgvaDatasetName,
    numSamples: 3,
    imageOptions: {
      width: 320,
      height: 240,
      fillColor: "#264653",
      hideLogs: true,
    },
    schema: {
      scene: "IntField",
      timestamp: "IntField",
      detections: "Detections",
    },
    labelSchemas: {
      detections: {
        type: "detections",
        component: "dropdown",
        classes: ["box"],
        attributes: [],
      },
    },
    withSampleData: ({ index }, { label }) => ({
      scene: 1,
      timestamp: index + 1,
      detections: label.detections([
        label.detection({ label: "box", bounding_box: BOX }),
      ]),
    }),
    savedViews: {
      dgva: `dataset.group_by("scene", order_by="timestamp", order_by_key=1)`,
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

/**
 * Zoom, pan, then reset, asserting the canvas after each gesture. The box
 * overlay must be painted, so a label that drifts off the media shows.
 */
const zoomPanReset = async (modal: ModalPom, name: string, field: string) => {
  const canvas = modal.sampleCanvas;

  await modal.videoAnnotate.assert.canvasRendersFields([field]);
  await canvas.assert.hasScreenshot(`${name}-initial.png`);

  // the screenshot parks the pointer at the viewport edge
  await canvas.move(0.5, 0.5);
  await canvas.zoomIn();
  await canvas.assert.hasScreenshot(`${name}-zoomed.png`);

  // start off the box: in Annotate a press on it grabs the label
  await canvas.pan(0.1, 0.9, 0.3, 0.9);
  await canvas.assert.hasScreenshot(`${name}-panned.png`);

  await canvas.resetZoomPan();
  await canvas.assert.hasScreenshot(`${name}-initial.png`);
};

test.describe.serial("Lighter video zoom and pan", () => {
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

    await zoomPanReset(modal, "video", "frames.detections");
  });

  test("dynamic group: wheel zooms, drag pans, and reset restores the initial frame", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, dgvaDatasetName, {
      searchParams: new URLSearchParams({ view: "dgva" }),
    });
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    await zoomPanReset(modal, "dgva", "detections");
  });
});
