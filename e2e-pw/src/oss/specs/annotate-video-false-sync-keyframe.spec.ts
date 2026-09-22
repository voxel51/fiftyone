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
 * frames 90-125 snaps onto the lie.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-false-sync");
const clip = `/tmp/${datasetName}.mp4`;

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 15,
    width: 64,
    height: 64,
    frameRate: 10,
    color: ["#3050a0", "#a05030"],
    keyframeInterval: 25,
    // true keyframes: samples 1, 26, 51, 76, 101, 126
    syncSamples: [1, 26, 51, 76, 90, 126],
  });
  await videoAnnotateSDK.seed({ datasetName, videoPaths: [clip] });
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

  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    withGrid: true,
  });
  await grid.openFirstSample();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();

  // frame 1 painted: the canvas takes the clip's dimensions
  await expect(modal.videoAnnotate.frameCanvas).toHaveAttribute("width", "64");
  const firstColor = await modal.videoAnnotate.frameCanvasImage();

  // ~frame 106: the chunk snaps to the flagged P-frame at sample 90
  await modal.videoAnnotate.seekToRulerFraction(0.7);
  await expect
    .poll(() => modal.videoAnnotate.frameCanvasImage())
    .not.toBe(firstColor);
  const secondColor = await modal.videoAnnotate.frameCanvasImage();

  // back to the first half, so the next assertion cannot pass on a stale canvas
  await modal.videoAnnotate.seekToRulerFraction(0.1);
  await expect
    .poll(() => modal.videoAnnotate.frameCanvasImage())
    .toBe(firstColor);

  // ~frame 83, decoded from the real keyframe at 76: same color, same pixels
  await modal.videoAnnotate.seekToRulerFraction(0.55);
  await expect
    .poll(() => modal.videoAnnotate.frameCanvasImage())
    .toBe(secondColor);

  expect(chunkFailures).toEqual([]);
});
