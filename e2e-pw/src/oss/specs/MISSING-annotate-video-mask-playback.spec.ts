/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A painted instance mask is a keyframe on the draw frame only; the box
 * auto-extends forward as non-keyframe filler. As the playhead moves onto a
 * filler frame, the track's overlay carries the box but NOT the mask — so the
 * mask must visibly clear (guards the `DetectionOverlay.applyLabel` fix: a frame
 * label whose `mask` is `undefined` — not just `null` — clears the stale mask).
 *
 * The sidebar mask preview is the render-level signal: it mounts only when the
 * selected label's live overlay reports `hasMask()`, so its presence on the
 * keyframe and absence on a filler frame proves the overlay paints/clears the
 * mask with the playhead. Detection-box draw + auto-extend are covered in
 * `MISSING-annotate-video-auto-extend.spec.ts`.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-mask-playback"
);
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
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
  // clean slate (no pre-seeded tracks) with the detections schema active, so
  // segmentation mode is enterable and the first paint creates the only track.
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
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

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepForward();
  }
};

const stepBack = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepBack();
  }
};

test("a painted mask clears on auto-extended filler frames during playback", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await openAnnotate(fiftyoneLoader, modal, page);
  const va = modal.videoAnnotate;

  await va.assert.objectTrackCount(0);

  // paint a mask on frame 1 — segmentation mode opens a fresh masked detection
  await modal.sidebar.annotate.segmentationMode();
  await modal.sidebar.edit.selectBrushTool();
  await va.paintMaskStroke([
    [0.4, 0.4],
    [0.48, 0.48],
    [0.56, 0.56],
  ]);
  await va.assert.objectTrackCount(1);

  // the keyframe carries the mask — the preview renders against the live overlay
  await modal.sidebar.edit.assert.hasMask(true);
  await modal.sidebar.edit.assert.hasMaskPreview(true);

  // commit a class so the box auto-extends into engine presence; the form stays
  // bound and follows the playhead
  const saved = page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method())
  );
  await modal.sidebar.edit.selectFieldChoice("label", "vehicle");
  await saved;
  await blur(page);

  // step onto a filler frame inside the auto-extended span: the box is present
  // but the mask is not — the overlay must clear it (the form stays open)
  await stepForward(modal, 10);
  await expect(modal.sidebar.edit.backButton).toBeVisible();
  await modal.sidebar.edit.assert.hasMask(false);
  await modal.sidebar.edit.assert.hasMaskPreview(false);

  // stepping back to the keyframe repaints the mask
  await stepBack(modal, 10);
  await modal.sidebar.edit.assert.hasMask(true);
  await modal.sidebar.edit.assert.hasMaskPreview(true);
});
