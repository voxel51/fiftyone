/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Dynamic-attribute sub-track rows on the video-annotation timeline. An
 * attribute declared `dynamic` in the `frames.detections` schema gets a
 * collapsible sub-track row beneath its parent object track, with the
 * attribute's value coalesced into segments along the timeline:
 *
 *  - sub-tracks are collapsed by default — a parent's chevron reveals them;
 *  - a declared-dynamic attribute always gets a row (uniform → one segment);
 *  - a mid-track edit (forward-fill) splits the row into two value segments;
 *  - collapsing hides the sub-track rows again.
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
  "annotate-video-dynamic-subtracks",
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
  page: Page,
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
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
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

/** Commit a `turn_signal` choice at the current frame and await the save. */
const setSignal = async (modal: ModalPom, page: Page, choice: string) => {
  const saved = savedResponse(page);
  await modal.sidebar.edit.selectFieldChoice(ATTR, choice);
  await saved;
};

/** Assert the selected track's `turn_signal` value at the current frame. */
const assertSignal = async (modal: ModalPom, expected: string) =>
  expect.poll(() => modal.sidebar.edit.getFieldValue(ATTR)).toBe(expected);

/** Seed one tracked instance carrying `turn_signal`="off" on every frame. */
const seedSingle = (sdk: { seed: (o: object) => Promise<unknown> }) =>
  sdk.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
    dynamicAttribute: { name: ATTR, values: ["off", "left", "right"] },
  });

test.describe.serial("video annotation dynamic attribute sub-tracks", () => {
  test.beforeEach(async ({ videoAnnotateSDK }) => {
    await seedSingle(videoAnnotateSDK);
  });

  test("a chevron reveals one sub-track per dynamic attribute; collapsing hides it", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    const parentId = await va.firstObjectTrackId();
    const subId = `${parentId}::${ATTR}`;

    // Collapsed by default — no sub-track rows.
    expect(await va.subTrackIds(parentId)).toHaveLength(0);

    // Expand: exactly the one declared-dynamic attribute's row appears.
    await va.toggleTrackExpansion(parentId);
    await expect.poll(() => va.subTrackIds(parentId)).toEqual([subId]);

    // Uniform "off" across the clip → a single value segment.
    await expect(va.segmentBars(subId)).toHaveCount(1);

    // Collapse: the sub-track row is hidden again.
    await va.toggleTrackExpansion(parentId);
    await expect.poll(() => va.subTrackIds(parentId)).toHaveLength(0);
  });

  test("a mid-track edit splits the sub-track into two value segments", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.selectLabel("vehicle");

    // Edit at frame 4 → "left": forward-fills 4..end, so "off" 1..3 / "left" 4..end.
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");

    const parentId = await va.firstObjectTrackId();
    const subId = `${parentId}::${ATTR}`;

    await va.toggleTrackExpansion(parentId);

    // Two value segments now, labelled by their values.
    await expect(va.segmentBars(subId)).toHaveCount(2);
    await expect(va.segmentBars(subId).nth(0)).toHaveAttribute("title", /off/);
    await expect(va.segmentBars(subId).nth(1)).toHaveAttribute("title", /left/);
  });

  test("undo collapses the two segments back to one", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.selectLabel("vehicle");

    // Split into two segments (off 1..3 / left 4..end).
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");

    const parentId = await va.firstObjectTrackId();
    const subId = `${parentId}::${ATTR}`;

    await va.toggleTrackExpansion(parentId);
    await expect(va.segmentBars(subId)).toHaveCount(2);

    // The whole forward-fill is one undo unit → the row reverts to one segment.
    await modal.sidebar.edit.undo();
    await expect(va.segmentBars(subId)).toHaveCount(1);
    await expect(va.segmentBars(subId).nth(0)).toHaveAttribute("title", /off/);
  });

  test("clicking a value segment seeks to its start", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.selectLabel("vehicle");

    // off 1..3 / left 4..end (the "left" segment starts at frame 4).
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");

    const parentId = await va.firstObjectTrackId();
    const subId = `${parentId}::${ATTR}`;

    await va.toggleTrackExpansion(parentId);

    // Move into the "off" region, then click the "left" segment.
    await stepFrames(modal, page, -3);
    await assertSignal(modal, "off");
    await va.segmentBars(subId).nth(1).click();

    // The playhead landed on the "left" segment's start (frame 4): it reads
    // "left", and one frame earlier (frame 3) is still "off".
    await assertSignal(modal, "left");
    await stepFrames(modal, page, -1);
    await assertSignal(modal, "off");
  });

  test("clicking a sub-track row selects the parent instance", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    const parentId = await va.firstObjectTrackId();
    const subId = `${parentId}::${ATTR}`;

    // Expand without selecting anything first.
    await va.toggleTrackExpansion(parentId);

    // Clicking the sub-track row selects the PARENT object track, opening its
    // editor — its `turn_signal` field becomes readable (frame 1 → "off").
    await va.clickTrack(subId);
    await expect(modal.sidebar.edit.getFieldContainer(ATTR)).toBeVisible();
    await assertSignal(modal, "off");
  });
});

test.describe.serial("video annotation multiple dynamic attributes", () => {
  test.beforeEach(async ({ videoAnnotateSDK }) => {
    await videoAnnotateSDK.seed({
      datasetName,
      videoPaths: [clip],
      withEvents: false,
      trackedSampleIndices: [0],
      dynamicAttributes: [
        { name: ATTR, values: ["off", "left", "right"] },
        { name: "brake", values: ["off", "on"] },
      ],
    });
  });

  test("a track expands to one sub-track row per declared dynamic attribute", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    const parentId = await va.firstObjectTrackId();

    await va.toggleTrackExpansion(parentId);
    await expect
      .poll(async () => (await va.subTrackIds(parentId)).sort())
      .toEqual([`${parentId}::brake`, `${parentId}::${ATTR}`].sort());
  });
});
