/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Drawing a fresh per-frame detection box on the video-annotation surface:
 *
 *  - auto-extend (guards `9dbd95a6b2`): a freshly-drawn box becomes a short
 *    track, copied forward ~30 frames as non-keyframe filler (clamped at the
 *    clip end). Bracketed semantically via engine presence — a frame inside the
 *    extent lists the label, a frame past it does not.
 *  - fresh-draw form-sync (guards finding A / fcc91e013a / 94c366c562): the
 *    moment the draw is released to the engine the edit form's field reads the
 *    schema field `detections` (NOT the raw engine path `frames.detections`),
 *    and the form keeps following the playhead with no deselect/reselect.
 *
 * Clean slate, re-seeded per test (no pre-existing tracks) so the draw is the
 * only object track. The clip is 40 frames so the 30-frame extent isn't clamped.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-auto-extend"
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
  // 40 frames @ 10fps — the 30-frame auto-extend stays clear of the clip end.
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 4,
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
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
  });
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

/** Draw a detection box across the given relative corners (annotate mode). */
const drawBox = async (modal: ModalPom) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(0.55, 0.55, "crosshair");
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(0.78, 0.78);
  await modal.sampleCanvas.up();
};

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepForward();
  }
};

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test.describe.serial("video annotation fresh draw", () => {
  test("a freshly-drawn box auto-extends ~30 frames forward as filler", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(0);
    await drawBox(modal);
    await va.assert.objectTrackCount(1);

    // commit the fresh draw (a class) so it — and the auto-extended filler —
    // enter engine presence; an uncommitted draft isn't listed in the sidebar
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.sidebar.edit.selectFieldChoice("label", "vehicle");
    await saved;
    await modal.sidebar.edit.exitToList();
    await blur(page);

    // frame 1 has exactly the drawn box
    await va.assert.listedLabelCount(1);

    // frame 28 is inside the auto-extended span [1, 31] — the filler is present
    await stepForward(modal, 27);
    await va.assert.listedLabelCount(1);

    // frame 35 is past the span — no filler there
    await stepForward(modal, 7);
    await va.assert.listedLabelCount(0);
  });

  test("the fresh-draw form reads the schema field and follows the playhead", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await drawBox(modal);

    // the form reads the schema field immediately (no deselect/reselect). The
    // schema exposes the frame field at its real path, so that field is
    // `frames.detections` — one namespace across schema, form, and engine.
    await expect
      .poll(() => modal.sidebar.edit.getCurrentField())
      .toBe("frames.detections");

    // committing a class keeps the form bound; the field stays `detections`
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
    );
    await modal.sidebar.edit.selectFieldChoice("label", "vehicle");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await saved;

    // the form follows the playhead without a manual reselect: still open, still
    // bound to the schema field on the next frame
    await blur(page);
    await va.stepForward();
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await expect
      .poll(() => modal.sidebar.edit.getCurrentField())
      .toBe("frames.detections");
  });

  test("undo removes a freshly-drawn box (engine undo on video)", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(0);
    await drawBox(modal);
    await va.assert.objectTrackCount(1);

    // undo/redo are enabled on the video surface (engine value-based stack). The
    // auto-extend filler coalesces into the draw's undo unit, so a SINGLE undo
    // removes the whole freshly-drawn track (box + filler).
    await modal.sidebar.edit.assert.undoIsEnabled();
    await modal.sidebar.edit.undo();
    await va.assert.objectTrackCount(0);

    // redo re-creates the whole track in one step
    await modal.sidebar.edit.redo();
    await va.assert.objectTrackCount(1);
  });
});
