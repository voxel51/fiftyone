/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * An image dataset grouped into an ordered video keeps each frame's primitives
 * on its own sample. The annotate sidebar reads them from the sample under the
 * playhead, the group's order-by field is listed read-only, and the timeline
 * readout shows the frame with the real order-by value beside it.
 */
import { test as base } from "src/oss/fixtures";
import type { Page } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-dgva-frame-primitives",
);
const FRAMES = 5;

const weatherAt = (frame: number) => `weather-${frame}`;
/** The order-by value of a frame: not the frame index, so the readout shows it. */
const timestampAt = (frame: number) => 10 * frame;

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
    mediaType: "image",
    datasetName,
    numSamples: FRAMES,
    imageOptions: {
      width: 320,
      height: 240,
      fillColor: "#264653",
      hideLogs: true,
    },
    schema: {
      scene: "IntField",
      timestamp: "IntField",
      frame_number: "IntField",
      weather: "StringField",
      detections: "Detections",
    },
    labelSchemas: {
      detections: {
        type: "detections",
        classes: ["cat"],
        attributes: [],
        component: "dropdown",
      },
      weather: { type: "str", component: "text" },
      timestamp: { type: "int", component: "text" },
      frame_number: { type: "int", component: "text" },
    },
    withSampleData: ({ index }) => ({
      scene: 1,
      timestamp: timestampAt(index + 1),
      frame_number: index + 1,
      weather: weatherAt(index + 1),
    }),
    savedViews: {
      dgva: `dataset.group_by("scene", order_by="timestamp", order_by_key=${timestampAt(1)})`,
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Drop focus so the "." frame-step keybinding is not typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test("primitives follow the playhead and the order-by field is read-only", async ({
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "dgva" }),
  });
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();

  const sidebar = modal.sidebar.annotate;
  await sidebar.assert.primitiveValue("weather", weatherAt(1));
  await sidebar.assert.primitiveValue("timestamp", String(timestampAt(1)));
  await modal.videoAnnotate.assert.frameReadout(
    `#1 / #${FRAMES} (${timestampAt(1)})`,
  );

  await blur(page);
  for (let i = 0; i < 2; i++) {
    await modal.videoAnnotate.stepForward();
  }
  await sidebar.assert.primitiveValue("weather", weatherAt(3));
  await sidebar.assert.primitiveValue("timestamp", String(timestampAt(3)));
  await sidebar.assert.primitiveValue("frame_number", "3");
  await modal.videoAnnotate.assert.frameReadout(
    `#3 / #${FRAMES} (${timestampAt(3)})`,
  );

  // the clock's frame display counts from 1 as well
  await modal.videoAnnotate.toggleClockDisplay();
  await modal.videoAnnotate.assert.clock(`#3 / #${FRAMES}`);

  // only the order-by field is reserved; a plain frame_number field edits
  await sidebar.assert.primitiveReadOnly("timestamp", true);
  await sidebar.assert.primitiveReadOnly("frame_number", false);
  await sidebar.assert.primitiveReadOnly("weather", false);
});
