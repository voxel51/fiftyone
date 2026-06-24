/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Undo/redo on the video-annotation surface, driven through the global command
 * stack (the engine is a producer/applicator of value-based entries, not the
 * undo authority). This exercises the parts unique to that wiring:
 *
 *  - a freshly-drawn track is ONE undo unit: the box plus its auto-extended
 *    frames coalesce, so a single undo removes the whole track (not one frame),
 *    and redo restores it;
 *  - undo/redo route through the KEYBOARD (Ctrl+Z / Ctrl+Shift+Z), proving the
 *    default command-context bindings reach the annotate stack;
 *  - a track-wide class edit is one undo unit (the fan-out reverts together);
 *  - a whole-track delete undoes to a restored track.
 *
 * Re-seeded per test (one tracked instance, class `vehicle`, on every frame) so a
 * persisting edit in one test can't leak into the next.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-undo");
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  // 20 frames @ 10fps — a drawn box auto-extends ~30, clamped to the clip.
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

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

/** Drop focus so Ctrl+Z reaches the command stack, not a focused input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Keyboard undo/redo — routes through the default command-context bindings. */
const undoKey = async (page: Page) => {
  await blur(page);
  await page.keyboard.press("Control+z");
};

const redoKey = async (page: Page) => {
  await blur(page);
  await page.keyboard.press("Control+Shift+z");
};

const savedResponse = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method())
  );

// re-seed per test: one tracked instance (vehicle) present on every frame.
test.beforeEach(async ({ videoAnnotateSDK }) => {
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
  });
});

test.describe.serial("video annotation undo/redo", () => {
  test("a drawn track is one undo unit: a single undo removes it, redo restores it", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    // the seeded track is the only object track
    await va.assert.objectTrackCount(1);

    // draw a second box; its auto-extend spans many frames as one coalesced unit
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.6, 0.6);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.82, 0.82);
    await modal.sampleCanvas.up();
    await va.assert.objectTrackCount(2);

    // ONE undo removes the entire drawn track (every auto-extended frame), not
    // just the last frame — leaving the seeded track intact
    await undoKey(page);
    await va.assert.objectTrackCount(1);

    // redo brings the whole drawn track back
    await redoKey(page);
    await va.assert.objectTrackCount(2);
  });

  test("a track-wide class edit undoes and redoes via the keyboard", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.labelListed("vehicle");
    await va.selectLabel("vehicle");

    // a class edit fans across the track (one undo unit)
    const saved = savedResponse(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;
    await modal.sidebar.edit.exitToList();
    await va.assert.labelListed("person");

    // keyboard undo reverts the whole fan-out back to "vehicle"
    await undoKey(page);
    await va.assert.labelListed("vehicle");
    await va.assert.labelListed("person", false);

    // keyboard redo re-applies it
    await redoKey(page);
    await va.assert.labelListed("person");
  });

  test("two distinct edits are two undo units — no duplicate entries", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle");

    // edit A: a track-wide class change (one engine transaction, one undo unit)
    await va.selectLabel("vehicle");
    const saved = savedResponse(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;
    await modal.sidebar.edit.exitToList();
    await va.assert.labelListed("person");

    // edit B: draw a second track (its auto-extend coalesces into one unit)
    await modal.sidebar.annotate.detectionMode("Detections");
    await modal.sampleCanvas.move(0.6, 0.6);
    await modal.sampleCanvas.down();
    await modal.sampleCanvas.move(0.82, 0.82);
    await modal.sampleCanvas.up();
    await va.assert.objectTrackCount(2);
    await modal.sidebar.edit.exitToList();

    // EXACTLY two undos return to baseline — one per edit. If either edit
    // pushed a duplicate entry (the Lighter self-undo or the form's own
    // undoable), two undos would leave the surface mid-edit and this fails.
    await undoKey(page);
    await va.assert.objectTrackCount(1);
    await undoKey(page);
    await va.assert.labelListed("vehicle");
    await va.assert.labelListed("person", false);

    // and exactly two redos reapply both, newest-undone first
    await redoKey(page);
    await va.assert.labelListed("person");
    await redoKey(page);
    await va.assert.objectTrackCount(2);
  });

  test("deleting a whole track undoes to a restored track", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    const [trackId] = await va.objectTrackIds();

    // whole-track delete (one engine transaction)
    await va.deleteTrackViaContextMenu(trackId);
    await va.assert.objectTrackCount(0);

    // a single undo restores the whole track
    await undoKey(page);
    await va.assert.objectTrackCount(1);
  });
});
