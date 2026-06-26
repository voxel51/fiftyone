/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Instance-level track actions on the video-annotation surface: SPLIT a track
 * into two objects at the playhead (frames >= F re-keyed onto a fresh instance,
 * the original keeps frames < F) and MERGE one track into another (the source's
 * frames re-keyed onto the target's instance, target-wins on overlap; the
 * source ceases to exist). Both are single engine transactions — one undo unit
 * — and survive a true round-trip (fresh browser context) via autosave.
 *
 * Seeded with two distinct tracks on sample 0: a "vehicle" (index=1) and a
 * "person" (index=2), each on every frame.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-track-split-merge",
);
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ videoAnnotateSDK }) => {
  // two tracks on sample 0: vehicle (index=1) + person (index=2), every frame.
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
    secondTrackSampleIndices: [0],
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

const savedResponse = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

test.describe.serial("video annotation track split / merge", () => {
  test("split at playhead (context menu) makes two tracks; undo restores one", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    // vehicle + person
    await va.assert.objectTrackCount(2);
    const vehicleId = await va.labelRowId("vehicle");

    // seek mid-clip so the playhead sits between the track's first and last
    // frame — both sides of the split are then non-empty
    await va.clickTrack(vehicleId);
    await va.seekToRulerFraction(0.5);
    await va.splitTrackViaContextMenu(vehicleId);

    // the vehicle track is now two; person is untouched (3 total)
    await va.assert.objectTrackCount(3);

    // one undo unit: back to vehicle + person
    await va.undo();
    await va.assert.objectTrackCount(2);
    await va.assert.hasTrack(vehicleId);
  });

  test("split at playhead (toolbar) makes two tracks", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    const vehicleId = await va.labelRowId("vehicle");

    // select the track (Split enables with one selected), then seek mid-clip
    // (the row click that selects also jumps the playhead to the track start)
    await va.clickTrack(vehicleId);
    await va.seekToRulerFraction(0.5);
    await va.clickSplitToolbarButton();

    await va.assert.objectTrackCount(3);
  });

  test("merge (context menu) folds the source into the target and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    await va.assert.labelListed("vehicle");
    await va.assert.labelListed("person");
    const personId = await va.labelRowId("person");

    // merge person INTO vehicle; both span every frame, so target-wins drops
    // every person frame — the person track disappears, vehicle survives
    const saved = savedResponse(page);
    await va.mergeTrackViaContextMenu(personId, "vehicle");
    await va.assert.objectTrackCount(1);
    await saved;

    await va.assert.labelListed("person", false);
    await va.assert.labelListed("vehicle");

    // the merge survives a true round-trip
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      await m2.videoAnnotate.assert.objectTrackCount(1);
      await m2.videoAnnotate.assert.labelListed("person", false);
      await m2.videoAnnotate.assert.labelListed("vehicle");
    } finally {
      await context.close();
    }
  });
});
