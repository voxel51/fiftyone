/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Editing an existing per-frame detection track on the video-annotation surface,
 * all through the annotation engine:
 *
 *  - track-wide fan-out (guards `trackFanOut` / 26cdd69308): a class edit on one
 *    frame fans across every frame of the instance, while geometry
 *    (`bounding_box`) stays per-frame.
 *  - anchor-follows-playhead (guards `d50221164d`): with a track selected, the
 *    edit form re-reads that track's data at each new frame as the playhead
 *    moves — it does NOT freeze on the selection frame's values or deselect.
 *  - selection sync: the canvas, the timeline row, and the sidebar row all drive
 *    the one shared engine selection, so selecting on any surface opens the
 *    editor on the same track.
 *
 * The dataset is re-seeded per test (one tracked instance, class `vehicle`,
 * `bounding_box=[0.3,0.3,0.2,0.2]` on every frame) so a persisting edit in one
 * test can't leak into the next.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-track-edit");
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  // 20 frames @ 10fps — long enough to step several frames off the start.
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

/** Read a numeric edit-form field value (the sidebar shows relative [0,1]). */
const fieldNum = async (modal: ModalPom, path: string) =>
  Number(await modal.sidebar.edit.getFieldValue(path));

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Await the autosave round-trip for the edited sample. */
const savedResponse = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method())
  );

// re-seed per test: one tracked instance (vehicle, index=1) on every frame.
test.beforeEach(async ({ videoAnnotateSDK }) => {
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
  });
});

test.describe.serial("video annotation track editing", () => {
  test("a class edit fans across the track while geometry stays per-frame", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    // the seeded track is the only object track; it shows as "vehicle" on frame 1
    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle");
    await va.selectLabel("vehicle");

    // per-frame geometry edit on frame 1 (bounding_box is NOT fanned out)
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.5, 4);

    // track-level class edit — fans across every frame of the instance
    const saved = savedResponse(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;

    // step well off the edited frame and re-select the (now "person") track
    await modal.sidebar.edit.exitToList();
    for (let i = 0; i < 5; i++) {
      await va.stepForward();
    }

    // the class fanned out: frame 6 lists "person", not "vehicle"
    await va.assert.labelListed("person");
    await va.assert.labelListed("vehicle", false);

    // but geometry did NOT fan out: frame 6 keeps the seeded x (0.3), not 0.5
    await va.selectLabel("person");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.3, 4);
  });

  test("the edit form follows the selected track across frames", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.selectLabel("vehicle");

    // make frame 1 geometrically distinct from the rest of the track
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.5, 4);

    // step forward: the form follows the anchor to frame 2's detection, so it
    // shows that frame's x (still the seeded 0.3) — NOT frame 1's edited 0.5,
    // and NOT a closed/blank form. Blur first so "." steps the frame instead of
    // typing into the focused number input.
    await blur(page);
    await va.stepForward();
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.3, 4);

    // step back: the form re-reads frame 1, where the edit lives
    await blur(page);
    await va.stepBack();
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.5, 4);
  });

  test("geometry edits undo and redo through the engine stack", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // undo/redo are enabled on the video surface (engine value-based stack)
    await openAnnotate(fiftyoneLoader, modal, page);

    await modal.videoAnnotate.selectLabel("vehicle");
    const before = await fieldNum(modal, "position.x");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // commit a geometry edit; undo becomes enabled
    await modal.sidebar.edit.setFieldValue("position.x", "0.1");
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.1, 4);
    await modal.sidebar.edit.assert.undoIsEnabled();

    // undo reverts to the committed baseline; redo re-applies
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 4);

    await modal.sidebar.edit.redo();
    await expect.poll(() => fieldNum(modal, "position.x")).toBeCloseTo(0.1, 4);

    // restore baseline for any sibling
    await modal.sidebar.edit.undo();
    await expect
      .poll(() => fieldNum(modal, "position.x"))
      .toBeCloseTo(before, 4);
  });

  test("selecting on the canvas, timeline, and sidebar all open the same editor", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    const [trackId] = await va.objectTrackIds();

    // sidebar row -> editor
    await va.selectLabel("vehicle");
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await modal.sidebar.edit.exitToList();

    // timeline row -> editor (same shared engine selection)
    await va.clickTrack(trackId);
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await modal.sidebar.edit.exitToList();

    // canvas overlay -> editor (the seeded box centers near 0.4,0.4 in relative
    // container coords; hover until the overlay's "pointer" cursor registers)
    await modal.sampleCanvas.move(0.4, 0.4, "pointer");
    await modal.sampleCanvas.click(0.4, 0.4);
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
  });
});
