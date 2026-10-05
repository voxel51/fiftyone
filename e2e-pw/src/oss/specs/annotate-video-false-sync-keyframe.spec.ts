/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A source video whose sync-sample table flags a frame that is not a keyframe
 * (open-GOP encodes do this). A chunk decoded from that frame either fails
 * outright (H.264: every frame after it black in Annotate) or decodes against
 * missing references (VP9: a corrupt picture). The decode worker now checks
 * the bytes and snaps back to a real keyframe, so the frames must match the
 * same pictures decoded from a true keyframe.
 *
 * The clip is two solid colors of about 75 frames, keyframes every 25 frames.
 * The sync table is rewritten so the true keyframe at sample 101 is unflagged
 * and the P-frame at sample 90 is flagged in its place: a seek anywhere in
 * frames 90-125 snaps onto the lie, while frames 76-89 decode from the true
 * keyframe at 76.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-false-sync");

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    videoOptions: {
      container: "mp4",
      duration: 15,
      width: 64,
      height: 64,
      frameRate: 10,
      color: ["#3050a0", "#a05030"],
      keyframeInterval: 25,
      // true keyframes: samples 1, 26, 51, 76, 101, 126
      syncSamples: [1, 26, 51, 76, 90, 126],
    },
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
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "tags", type: "list<str>", component: "text" },
          { name: "confidence", type: "float", component: "text" },
          { name: "index", type: "int", component: "text" },
          { name: "mask_path", type: "str", component: "text" },
        ],
      },
    },
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("frames behind a false keyframe flag still decode", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  const chunkFailures: string[] = [];
  page.on("console", (message) => {
    if (/worker chunk \d+ failed/.test(message.text())) {
      chunkFailures.push(message.text());
    }
  });

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.openFirstSample();
  await modal.videoAnnotate.afterSurface(() =>
    modal.sidebar.switchMode("annotate"),
  );

  // frame 1 painted: the canvas takes the clip's dimensions
  await modal.videoAnnotate.untilFramePainted(1);
  expect(await modal.videoAnnotate.frameCanvas.getAttribute("width")).toBe(
    "64",
  );
  const firstColor = await modal.videoAnnotate.frameCanvasImage();

  // a chunk here snaps to the flagged P-frame at sample 90
  const behindLie = await modal.videoAnnotate.seekAndPaint(0.7);
  expect(behindLie).toBeGreaterThanOrEqual(90);
  expect(behindLie).toBeLessThan(126);
  const secondColor = await modal.videoAnnotate.frameCanvasImage();
  expect(secondColor).not.toBe(firstColor);

  // back to the first color, so the last read cannot pass on a stale canvas
  await modal.videoAnnotate.seekAndPaint(0.1);
  expect(await modal.videoAnnotate.frameCanvasImage()).toBe(firstColor);

  // decoded from the real keyframe at 76: the same color, the same pixels
  const beforeLie = await modal.videoAnnotate.seekAndPaint(0.55);
  expect(beforeLie).toBeGreaterThanOrEqual(76);
  expect(beforeLie).toBeLessThan(90);
  expect(await modal.videoAnnotate.frameCanvasImage()).toBe(secondColor);

  expect(chunkFailures).toEqual([]);
});
