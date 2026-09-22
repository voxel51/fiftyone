/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Paging between video samples on the annotation surface must re-home the
 * engine store cleanly, guarding the "a store for sample X is already
 * registered" crash where the 3D-scene registration raced the video surface's
 * store. The modal is opened from the grid, since a deep-linked sample has no
 * next/previous sibling.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-nav");

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // both samples carry their own tracked instance, so the object track id
  // differs between samples — a reliable "the surface switched" signal.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    numSamples: 2,
    videoOptions: (index) => (index === 1 ? { color: "#a05030" } : {}),
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
    withFrameData: ({ sampleIndex }, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance(`${sampleIndex}-vehicle-1`),
        }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("video annotation sample navigation", () => {
  test("paging next then prev re-homes the store without a duplicate-store crash", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    const storeErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (/store|registered/i.test(e.message)) storeErrors.push(e.message);
    });

    // open the modal from the grid so it carries the sample sequence
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      withGrid: true,
    });
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    const va = modal.videoAnnotate;
    await va.assert.objectTrackCount(1);
    const [firstTrack] = await va.objectTrackIds();

    // page forward to the next video sample (ArrowRight = ModalNextSample)
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => {
        const ids = await va.objectTrackIds();
        return ids.length === 1 && ids[0] !== firstTrack;
      })
      .toBe(true);
    await va.waitForSurface();
    const [secondTrack] = await va.objectTrackIds();

    // page back to the first sample
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => {
        const ids = await va.objectTrackIds();
        return ids.length === 1 && ids[0] === firstTrack;
      })
      .toBe(true);
    await va.waitForSurface();

    expect(secondTrack).not.toBe(firstTrack);
    // no "a store for sample X is already registered" (or similar) was thrown
    expect(storeErrors).toEqual([]);
  });
});
