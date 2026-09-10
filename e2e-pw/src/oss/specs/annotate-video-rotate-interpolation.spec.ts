/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Video keyframe interpolation of rotated bounding boxes (FOEPD-4586):
 * rotation lerps between keyframes along the SHORTEST arc — a 6.1 → 0.2 rad
 * pair (350° → 10°) sweeps ~20° through zero, never ~340° backwards.
 *
 * Flow: draw a box (frame 1 keyframe + auto-extend filler), set rotation 6.1
 * through the edit form, step to frame 11 and set 0.2 (promotes the frame to a
 * keyframe and re-lerps the segment), then read the interpolated rotation at
 * the midpoint frame back through the playhead-following edit form.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-rotate-interp",
);
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

/** Keyframe rotations bracketing 0 rad: 350° and 10°. */
const LEFT_ROTATION = 6.1;
const RIGHT_ROTATION = 0.2;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  // 40 frames @ 10fps — room for the keyframe pair and the auto-extend
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
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

/** Draw a detection box (annotate mode) on the current frame. */
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

const stepBack = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepBack();
  }
};

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Read a numeric edit-form field value. */
const fieldNum = async (modal: ModalPom, path: string) =>
  Number(await modal.sidebar.edit.getFieldValue(path));

/** Radian distance from 0, wrap-aware: min(v, 2*pi - v). */
const distanceFromZero = (v: number) =>
  Math.min(Math.abs(v), 2 * Math.PI - Math.abs(v));

test.describe.serial("video rotation interpolation", () => {
  test("rotation lerps the shortest arc between keyframes", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // keyframe A (frame 1): draw, then rotate via the form
    await drawBox(modal);
    await modal.sidebar.edit.setFieldValue(
      "rotation.rotation",
      `${LEFT_ROTATION}`,
    );
    await expect
      .poll(() => fieldNum(modal, "rotation.rotation"))
      .toBeCloseTo(LEFT_ROTATION, 4);

    // keyframe B (frame 11): a rotation edit on the auto-extended filler
    // promotes the frame to a keyframe and re-lerps the segment
    await blur(page);
    await stepForward(modal, 10);
    await modal.sidebar.edit.setFieldValue(
      "rotation.rotation",
      `${RIGHT_ROTATION}`,
    );
    await expect
      .poll(() => fieldNum(modal, "rotation.rotation"))
      .toBeCloseTo(RIGHT_ROTATION, 4);

    // midpoint (frame 6): the form follows the playhead and reads the
    // interpolated label. 6.1 -> 0.2 crosses zero, so the midpoint sits
    // within ~0.2 rad of 0 — the long way around would put it near pi.
    await blur(page);
    await stepBack(modal, 5);
    await expect
      .poll(async () =>
        distanceFromZero(await fieldNum(modal, "rotation.rotation")),
      )
      .toBeLessThan(0.5);

    // and every in-between frame stays on the short arc (nothing near pi)
    await blur(page);
    await stepBack(modal, 3); // frame 3
    for (let frame = 3; frame <= 9; frame += 3) {
      await expect
        .poll(async () =>
          distanceFromZero(await fieldNum(modal, "rotation.rotation")),
        )
        .toBeLessThan(1.0);
      await blur(page);
      await stepForward(modal, 3);
    }
  });
});
