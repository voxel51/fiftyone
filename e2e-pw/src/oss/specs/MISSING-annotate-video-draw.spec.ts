/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Per-frame detection drawing on the video-annotation surface: drawing a box in
 * detection mode adds a track to the timeline, the freshly-drawn box opens its
 * edit form, assigning a class commits it through the engine, and the frame
 * label survives a true round-trip (fresh browser context). Foundational
 * coverage for video on the annotation engine.
 */
import { Browser, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-draw");

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
  // clean slate (no pre-seeded tracks): drawing is the only object track.
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

/** Verify persisted state from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await openAnnotate(fiftyoneLoader, freshModal, freshPage);
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

test.describe.serial("video per-frame detection drawing", () => {
  test("drawing a box adds a timeline track, opens its editor, and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // clean slate: no object tracks yet
    await modal.videoAnnotate.assert.objectTrackCount(0);

    // draw a box in detection mode
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.55, 0.55);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.78, 0.78);
    await modal.sampleCanvas.up();

    // the draw creates exactly one object track on the timeline
    await modal.videoAnnotate.assert.objectTrackCount(1);

    // the freshly-drawn box opens its edit form; assigning a class commits it
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "vehicle");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await saved;

    // the frame label survives a true round-trip
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(1);
    });
  });
});
