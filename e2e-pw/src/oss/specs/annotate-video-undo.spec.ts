/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Undo/redo on the video surface through the global command stack: a
 * freshly-drawn track (box plus auto-extended frames) is one undo unit,
 * keyboard Ctrl+Z / Ctrl+Shift+Z reach the annotate stack, a track-wide class
 * edit reverts together, and a whole-track delete undoes to a restored track.
 * Re-seeded per test with one tracked `vehicle` on every frame.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-undo");
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
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

// re-seed per test: one tracked instance (vehicle) present on every frame.
// 20 frames @ 10fps — a drawn box auto-extends ~30, clamped to the clip.
test.beforeEach(async ({ datasetFactory }) => {
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

    // the tracks drawer starts closed, so pin the row into the header to reach
    // its interval bar without opening the drawer
    await va.pinTrack(trackId);

    // whole-track delete (one engine transaction)
    await va.deleteTrackViaContextMenu(trackId);
    await va.assert.objectTrackCount(0);

    // a single undo restores the whole track
    await undoKey(page);
    await va.assert.objectTrackCount(1);
  });
});
