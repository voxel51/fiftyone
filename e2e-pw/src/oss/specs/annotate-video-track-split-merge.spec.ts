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
import type {
  DatasetFactory,
  FrameTrackLabel,
} from "src/shared/dataset-factory";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-track-split-merge",
);
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

// Two tracks on sample 0 (vehicle index=1 + a second index=2), every frame.
// `secondTrackClassIndex` 1 => cross-class ("person"); 0 => same-class ("vehicle").
const seedTwoTracks = (
  datasetFactory: typeof DatasetFactory,
  secondTrackClassIndex = 1,
) =>
  datasetFactory.createVideoDataset({
    datasetName,
    withEvents: false,
    trackedSampleIndices: [0],
    secondTrackSampleIndices: [0],
    secondTrackClassIndex,
  });

test.beforeEach(async ({ datasetFactory }) => {
  // default: cross-class (vehicle + person) — used by split + merge-gating.
  await seedTwoTracks(datasetFactory);
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

/**
 * The two tracks a split leaves on `field`, from the database: `head` is the
 * split track's original instance (frames before the cut), `tail` the instance
 * the split minted (frames from the cut on). Both sides of the cut must be
 * keyframes — each half re-lerps from its own keyframes afterwards, so without
 * the pin the shape at the cut jumps — and nothing else may have been promoted.
 * Other tracks on the field (the untouched second class) are ignored.
 */
const expectSplitPersisted = (
  rows: FrameTrackLabel[],
  before: TrackInstances,
  totalFrames: number,
) => {
  const byInstance = new Map<string, FrameTrackLabel[]>();
  for (const row of rows) {
    if (!row.instance) continue;
    byInstance.set(row.instance, [
      ...(byInstance.get(row.instance) ?? []),
      row,
    ]);
  }

  const head = byInstance.get(before.target) ?? [];
  const minted = [...byInstance.keys()].filter(
    (instance) => !before.all.has(instance),
  );
  expect(minted, "the split mints exactly one new instance").toHaveLength(1);
  const tail = byInstance.get(minted[0]) ?? [];

  const frames = (labels: FrameTrackLabel[]) =>
    labels.map((l) => l.frame).sort((a, b) => a - b);
  const headFrames = frames(head);
  const tailFrames = frames(tail);
  const cut = tailFrames[0];

  expect(headFrames[0]).toBe(1);
  expect(headFrames.at(-1), "head ends right before the cut").toBe(cut - 1);
  expect(tailFrames.at(-1), "tail runs to the last frame").toBe(totalFrames);

  const keyframes = (labels: FrameTrackLabel[]) =>
    frames(labels.filter((l) => l.keyframe));
  expect(keyframes(head), "head's last frame is its only keyframe").toEqual([
    cut - 1,
  ]);
  expect(keyframes(tail), "tail's first frame is its only keyframe").toEqual([
    cut,
  ]);

  for (const row of [...head, ...tail]) {
    expect(row.hasGeometry, `frame ${row.frame} keeps its geometry`).toBe(true);
  }
};

/** The tracks on `field` before an edit: every instance, and the one to split. */
interface TrackInstances {
  all: Set<string>;
  target: string;
}

const persistedInstances = async (
  datasetFactory: typeof DatasetFactory,
  field: string,
  targetLabel: string,
): Promise<TrackInstances> => {
  const rows = await datasetFactory.frameTrackState(datasetName, field);
  const all = new Set(
    rows.map((row) => row.instance).filter((id): id is string => !!id),
  );
  const target = rows.find((row) => row.label === targetLabel)?.instance;
  expect(target, `a "${targetLabel}" track is seeded`).toBeTruthy();

  return { all, target: target as string };
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

    // the tracks drawer starts closed; pin the row so its timeline interactions
    // have a visible target
    await va.pinTrack(vehicleId);

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

    // the tracks drawer starts closed; pin the row so the timeline click has a
    // visible target
    await va.pinTrack(vehicleId);

    // select the track (Split enables with one selected), then seek mid-clip
    // (the row click that selects also jumps the playhead to the track start)
    await va.clickTrack(vehicleId);
    await va.seekToRulerFraction(0.5);
    await va.clickSplitToolbarButton();

    await va.assert.objectTrackCount(3);
  });

  test("split pins both sides of the cut as keyframes and persists", async ({
    fiftyoneLoader,
    modal,
    page,
    datasetFactory,
  }) => {
    const before = await persistedInstances(
      datasetFactory,
      "detections",
      "vehicle",
    );

    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    const vehicleId = await va.labelRowId("vehicle");
    await va.pinTrack(vehicleId);
    await va.clickTrack(vehicleId);
    await va.seekToRulerFraction(0.5);

    const saved = savedResponse(page);
    await va.clickSplitToolbarButton();
    await va.assert.objectTrackCount(3);
    await saved;

    // 2 s at 10 fps
    const rows = await datasetFactory.frameTrackState(
      datasetName,
      "detections",
    );
    expectSplitPersisted(rows, before, 20);
  });

  test("split a polyline track: two tracks, both cut frames keyframes, vertices kept", async ({
    fiftyoneLoader,
    modal,
    page,
    datasetFactory,
  }) => {
    // one detection track (vehicle) + one polyline track (person, index=2);
    // no second detection track, so "person" names the polyline
    await datasetFactory.createVideoDataset({
      datasetName,
      withEvents: false,
      trackedSampleIndices: [0],
      polylineSampleIndices: [0],
    });
    const before = await persistedInstances(
      datasetFactory,
      "polylines",
      "person",
    );

    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    const personId = await va.labelRowId("person");
    await va.pinTrack(personId);
    await va.clickTrack(personId);
    await va.seekToRulerFraction(0.5);

    const saved = savedResponse(page);
    await va.clickSplitToolbarButton();
    await va.assert.objectTrackCount(3);
    await saved;

    const rows = await datasetFactory.frameTrackState(datasetName, "polylines");
    expectSplitPersisted(rows, before, 20);
  });

  test("merge (context menu) folds one same-class track into the other and persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
    datasetFactory,
  }) => {
    // merge is gated to same-class tracks, so re-seed both as "vehicle". The
    // two share a class but are distinct instances (index 1 vs 2).
    await seedTwoTracks(datasetFactory, 0);

    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(2);
    await va.assert.labelListed("vehicle");
    const [sourceId] = await va.objectTrackIds();

    // the tracks drawer starts closed; pin the source row so its context menu
    // is reachable
    await va.pinTrack(sourceId);

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

    // the tracks drawer starts closed; pin the row so its context menu is
    // reachable
    await va.pinTrack(personId);

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
