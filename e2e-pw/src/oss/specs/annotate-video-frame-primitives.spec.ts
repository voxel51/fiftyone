/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Frame-scoped primitives in the annotate sidebar follow the playhead. A
 * video's `frames.*` fields read from the frame under the playhead, and the
 * clip's own clock, `frames.frame_number`, is listed read-only. The timeline
 * clock counts frames from 1.
 */
import { test as base } from "src/oss/fixtures";
import type { Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { videoAnnotationSeed } from "./annotate-video/seed";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-frame-primitives",
);
const id = "000000000000000000000000";

const weatherAt = (frame: number) => `weather-${frame}`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  const seed = videoAnnotationSeed({
    withEvents: false,
    trackedSampleIndices: [0],
  });
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    schema: { ...seed.schema, "frames.weather": "StringField" },
    labelSchemas: {
      ...seed.labelSchemas,
      "frames.weather": { type: "str", component: "text" },
      "frames.frame_number": { type: "int", component: "text" },
    },
    sampleFrames: seed.sampleFrames,
    withSampleData: seed.withSampleData,
    withFrameData: (frame, helpers) => ({
      ...seed.withFrameData(frame, helpers),
      weather: weatherAt(frame.frameNumber),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Drop focus so the "." frame-step keybinding is not typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test("frame primitives follow the playhead and the frame number is read-only", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();

  const sidebar = modal.sidebar.annotate;
  await sidebar.assert.primitiveValue("frames.weather", weatherAt(1));
  await sidebar.assert.primitiveValue("frames.frame_number", "1");
  // the current frame pads to the total's width
  await modal.videoAnnotate.assert.clock("# 1 / #20");

  await blur(page);
  for (let i = 0; i < 3; i++) {
    await modal.videoAnnotate.stepForward();
  }
  await sidebar.assert.primitiveValue("frames.weather", weatherAt(4));
  await sidebar.assert.primitiveValue("frames.frame_number", "4");
  await modal.videoAnnotate.assert.clock("# 4 / #20");

  await sidebar.assert.primitiveReadOnly("frames.frame_number", true);
  await sidebar.assert.primitiveReadOnly("frames.weather", false);
});
