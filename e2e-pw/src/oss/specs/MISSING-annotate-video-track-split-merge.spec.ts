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
 * Seeded with two tracks on sample 0, each on every frame. By default they are
 * distinct classes ("vehicle" index=1 + "person" index=2) — used by split and
 * by the cross-class merge-gating test. The successful-merge test re-seeds both
 * as the same class, since merge is gated to same-class tracks.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";
import type { VideoAnnotateSDK } from "src/oss/fixtures/video-annotate-sdk";

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

// Two tracks on sample 0 (vehicle index=1 + a second index=2), every frame.
// `secondTrackClassIndex` 1 => cross-class ("person"); 0 => same-class ("vehicle").
const seedTwoTracks = (sdk: VideoAnnotateSDK, secondTrackClassIndex = 1) =>
  sdk.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
    secondTrackSampleIndices: [0],
    secondTrackClassIndex,
  });

test.beforeEach(async ({ videoAnnotateSDK }) => {
  // default: cross-class (vehicle + person) — used by split + merge-gating.
  await seedTwoTracks(videoAnnotateSDK);
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

  test("merge (context menu) folds one same-class track into the other and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
    videoAnnotateSDK,
  }) => {
    // merge is gated to same-class tracks, so re-seed both as "vehicle". The
    // two share a class but are distinct instances (index 1 vs 2).
    await seedTwoTracks(videoAnnotateSDK, 0);

    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    await va.assert.labelListed("vehicle");
    const [sourceId] = await va.objectTrackIds();

    // merge one vehicle INTO the other; both span every frame, so target-wins
    // drops every source frame — one track remains, still "vehicle"
    const saved = savedResponse(page);
    await va.mergeTrackViaContextMenu(sourceId, "vehicle");
    await va.assert.objectTrackCount(1);
    await saved;

    await va.assert.labelListed("vehicle");

    // the merge survives a true round-trip
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      await m2.videoAnnotate.assert.objectTrackCount(1);
      await m2.videoAnnotate.assert.labelListed("vehicle");
    } finally {
      await context.close();
    }
  });

  test("merge is gated by class: a cross-class track offers no merge target", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // default seed is cross-class (vehicle + person). Merge folds a track into
    // another OF THE SAME CLASS, so neither track may merge into the other —
    // the context menu must offer no "Merge into …" item.
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    await va.assert.labelListed("vehicle");
    await va.assert.labelListed("person");
    const personId = await va.labelRowId("person");

    // right-click the person track's bar; the menu opens (Delete track proves
    // it did) but carries no merge target — the only other track is a different
    // class
    await va.trackBar(personId).click({ button: "right" });
    await expect(
      page.getByRole("menuitem", { name: "Delete track" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /^Merge into / }),
    ).toHaveCount(0);

    // both tracks survive — nothing merged
    await page.keyboard.press("Escape");
    await va.assert.objectTrackCount(2);
  });
});
