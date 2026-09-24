/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Whole-track delete on the video surface: the sidebar/keyboard delete is
 * per-frame, so a whole track is deleted from the timeline row's context menu,
 * removing the instance's label on every frame in one engine transaction. The
 * removal survives a fresh browser context via autosave.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-track-delete",
);
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory }) => {
  // one tracked vehicle (index=1) on every frame; no TDs to keep the timeline
  // to a single object track.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
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
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
        }),
      ]),
    }),
  });
});

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) await modal.videoAnnotate.stepForward();
};

test.describe.serial("video annotation whole-track delete", () => {
  test("right-click Delete track removes the instance from every frame and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle");
    const [trackId] = await va.objectTrackIds();

    // the tracks drawer starts closed; pin the row into the header to reach its
    // interval bar
    await va.pinTrack(trackId);

    // delete the whole track via the timeline context menu; autosave persists it
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await va.deleteTrackViaContextMenu(trackId);
    await va.assert.objectTrackCount(0);
    await saved;

    // gone from frame 1 and from a later frame (the WHOLE track, not one frame)
    await va.assert.labelListed("vehicle", false);
    await stepForward(modal, 9);
    await va.assert.labelListed("vehicle", false);

    // the whole-track delete survives a true round-trip
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      await m2.videoAnnotate.assert.objectTrackCount(0);
      await m2.videoAnnotate.assert.labelListed("vehicle", false);
    } finally {
      await context.close();
    }
  });
});
