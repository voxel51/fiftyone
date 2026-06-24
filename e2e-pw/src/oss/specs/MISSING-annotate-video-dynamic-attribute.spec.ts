/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Dynamic-attribute propagation on the video-annotation surface. An attribute
 * declared `dynamic` in the `frames.detections` schema carries per-frame
 * meaning, so a sidebar edit does NOT fan across the whole track (that is the
 * static-attribute behaviour, guarded by `track-edit`). Instead it forward-fills
 * from the edited frame:
 *
 *  - editing at frame F sets `[F, end]`, leaving frames before F untouched;
 *  - a later edit creates a change boundary, and a subsequent edit before it
 *    fills only up to that boundary (sample-and-hold), preserving the later
 *    segment;
 *  - the whole forward-fill is a single engine transaction — one undo step.
 *
 * The dataset is re-seeded per test (one tracked `vehicle` instance with a
 * dynamic `turn_signal` attribute = "off" on every frame) so a persisting edit
 * can't leak into the next test.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-dynamic-attr"
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
  // 20 frames @ 10fps — long enough to fill several frames forward.
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

const ATTR = "turn_signal";

/** Step the playhead by `delta` frames (negative = backward), un-focused. */
const stepFrames = async (modal: ModalPom, page: Page, delta: number) => {
  await blur(page);
  const va = modal.videoAnnotate;

  for (let i = 0; i < Math.abs(delta); i++) {
    if (delta > 0) {
      await va.stepForward();
    } else {
      await va.stepBack();
    }
  }
};

/** Assert the selected track's `turn_signal` value at the current frame. */
const assertSignal = async (modal: ModalPom, expected: string) =>
  expect.poll(() => modal.sidebar.edit.getFieldValue(ATTR)).toBe(expected);

/** Commit a `turn_signal` choice at the current frame and await the save. */
const setSignal = async (modal: ModalPom, page: Page, choice: string) => {
  const saved = savedResponse(page);
  await modal.sidebar.edit.selectFieldChoice(ATTR, choice);
  await saved;
};

// re-seed per test: one tracked instance carrying turn_signal="off" everywhere.
test.beforeEach(async ({ videoAnnotateSDK }) => {
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
    dynamicAttribute: { name: ATTR, values: ["off", "left", "right"] },
  });
});

test.describe.serial("video annotation dynamic attribute", () => {
  test("an edit forward-fills to the track end, leaving earlier frames", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // select the seeded track; frame 1 reads the seeded "off"
    await modal.videoAnnotate.selectLabel("vehicle");
    await assertSignal(modal, "off");

    // edit at frame 4 -> "left"
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");
    await assertSignal(modal, "left");

    // earlier frame is untouched (forward-fill only)
    await stepFrames(modal, page, -1);
    await assertSignal(modal, "off");

    // a far-forward frame is filled — the value runs to the clip's end
    await stepFrames(modal, page, 10);
    await assertSignal(modal, "left");

    // the whole forward-fill is one undo unit: reverts every frame at once
    await modal.sidebar.edit.undo();
    await assertSignal(modal, "off");

    await stepFrames(modal, page, -9);
    await assertSignal(modal, "off");
  });

  test("a later change bounds a subsequent fill (sample-and-hold)", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    await modal.videoAnnotate.selectLabel("vehicle");

    // frame 4 -> "left" (left runs 4..end)
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");

    // frame 8 -> "right" (a change boundary: left 4..7, right 8..end)
    await stepFrames(modal, page, 4);
    await setSignal(modal, page, "right");

    // frame 6 -> "off": fills forward only up to the frame-8 boundary
    await stepFrames(modal, page, -2);
    await setSignal(modal, page, "off");
    await assertSignal(modal, "off");

    // frame 7 took the new value...
    await stepFrames(modal, page, 1);
    await assertSignal(modal, "off");

    // ...but frame 8 keeps "right" — the boundary was preserved
    await stepFrames(modal, page, 1);
    await assertSignal(modal, "right");

    // and frame 4 (before the edited frame) is still "left"
    await stepFrames(modal, page, -4);
    await assertSignal(modal, "left");
  });
});
