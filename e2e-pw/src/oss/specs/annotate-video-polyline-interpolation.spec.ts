/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Polyline keyframe interpolation on the video-annotation surface, and — the
 * reason this spec exists — whether the CANVAS shows it.
 *
 * Reported: draw a polyline, scrub forward, drag a vertex (promoting a second
 * keyframe), then scrub back through the span. The interpolated frames are
 * correct in the store (verified against mongo) and Explore mode draws them, but
 * the annotate canvas keeps painting the shape it already had — until the
 * playhead leaves the track's extent entirely and comes back, which unmounts and
 * re-mounts the overlay.
 *
 * So the two halves are asserted separately:
 *   1. the interpolation itself — geometry moves between the keyframes
 *   2. the projection — what the overlay actually holds at those frames
 * A pass on (1) with a failure on (2) is precisely the reported bug.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-polyline-interp",
);
const id = "000000000000000000000000";
// .mp4 so the surface takes the mp4/native decode path the reported clip uses
const clip = `/tmp/${datasetName}.mp4`;

/** Vertices of the drawn shape, in relative canvas coordinates. */
const DRAWN: Array<[number, number]> = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.5, 0.7],
];
/** A point inside the drawn shape — clicking here selects the overlay. */
const BODY: [number, number] = [0.5, 0.43];
/** How far to drag a vertex, in container units (upwards). */
const DRAG_DY = 0.14;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  // ~180 frames @ 30fps, matching the reported clip's shape (the 10fps/40-frame
  // variant of this spec passes, so frame rate / clip length is a suspect)
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 6,
    width: 64,
    height: 64,
    frameRate: 30,
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
    // schema only: this spec draws the first polyline itself
    withPolylineField: true,
    // the reported sample carried several other polyline tracks; a pre-seeded
    // track makes the drawn one share the surface, as it did there
    polylineSampleIndices: [0],
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

/**
 * Draw the polyline, then DISARM draw mode via the toolbar toggle. Right-click
 * alone leaves the cursor `crosshair` over the image and a press then extends /
 * re-draws instead of moving the shape; toggling the tool off is what makes the
 * canvas accept an edit gesture.
 */
const drawPolyline = async (modal: ModalPom): Promise<string> => {
  const before = new Set(await polylineIds(modal));

  await modal.sidebar.annotate.polylineMode();
  await modal.videoAnnotate.drawPolyline(DRAWN);
  await modal.sampleCanvas.rightClick(0.9, 0.1);
  await modal.sidebar.annotate.polylineMode();

  const drawnId = (await polylineIds(modal)).find((id) => !before.has(id));
  expect(drawnId, "the drawn polyline should be a new overlay").toBeTruthy();

  return drawnId as string;
};

/**
 * Mean vertex position — the measurement this spec compares frames by. The
 * overlay does not preserve the order vertices were drawn in (and correspondence
 * may rotate a closed ring), so an index-wise comparison would be meaningless;
 * the centroid moves with the shape either way.
 */
/** Overlay ids of the polylines currently on the canvas. */
const polylineIds = async (modal: ModalPom): Promise<string[]> =>
  (await modal.videoAnnotate.canvasOverlayGeometry())
    .filter((o) => o.type === "PolylineOverlay")
    .map((o) => o.id);

/**
 * Points of ONE overlay by id. The sample carries more than one polyline track,
 * so "the polyline on the canvas" is ambiguous — every read has to name the
 * track under test.
 */
const pointsOf = async (
  modal: ModalPom,
  id: string,
): Promise<[number, number][] | undefined> =>
  (await modal.videoAnnotate.canvasOverlayGeometry()).find((o) => o.id === id)
    ?.points;

const centroidY = (points: [number, number][] | undefined): number => {
  if (!points?.length) {
    return Number.NaN;
  }

  return points.reduce((total, [, y]) => total + y, 0) / points.length;
};

/**
 * Container coordinates are not overlay coordinates: the clip is letterboxed, so
 * the canvas applies an affine to reach image space. Derive it from the draw
 * itself — the same three points, expressed both ways. Sorting each set by x
 * pairs them, since the overlay does not preserve draw order.
 */
const deriveToContainer = (
  drawnOverlayPoints: [number, number][],
): ((point: [number, number]) => [number, number]) => {
  const img = [...drawnOverlayPoints].sort((a, b) => a[0] - b[0]);
  const cont = [...DRAWN].sort((a, b) => a[0] - b[0]);

  const ax = (img[2][0] - img[0][0]) / (cont[2][0] - cont[0][0]);
  const bx = img[0][0] - ax * cont[0][0];
  const ay = (img[1][1] - img[0][1]) / (cont[1][1] - cont[0][1]);
  const by = img[0][1] - ay * cont[0][1];

  return ([ix, iy]) => [(ix - bx) / ax, (iy - by) / ay];
};

/**
 * Drag one vertex on the current frame, promoting it to a keyframe.
 *
 * A vertex drag specifically: dragging the shape's BODY is silently ignored on a
 * non-keyframe frame (worth its own investigation), whereas a vertex drag
 * commits there — which is also the gesture the bug report used.
 */
const dragVertex = async (
  modal: ModalPom,
  id: string,
  toContainer: (point: [number, number]) => [number, number],
) => {
  // select the overlay first; a vertex is only grabbable once it is drawn
  await modal.sampleCanvas.click(BODY[0], BODY[1]);

  const live = await pointsOf(modal, id);
  const [vx, vy] = toContainer((live as [number, number][])[0]);

  await modal.sampleCanvas.move(vx, vy);
  await modal.sampleCanvas.down();
  for (const step of [0.15, 0.45, 0.75, 1]) {
    await modal.sampleCanvas.move(vx, vy - DRAG_DY * step);
  }
  await modal.sampleCanvas.up();
};

test.describe.serial("polyline interpolation on video", () => {
  test("the canvas paints interpolated geometry while scrubbing the span", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    const id = await drawPolyline(modal);
    await blur(page);

    const drawn = await pointsOf(modal, id);
    expect(drawn, "the drawn polyline should be on the canvas").toHaveLength(3);
    const toContainer = deriveToContainer(drawn as [number, number][]);

    // second keyframe 10 frames along
    await stepForward(modal, 10);
    await dragVertex(modal, id, toContainer);
    await blur(page);

    const atKeyframe = await pointsOf(modal, id);
    expect(
      Math.abs(centroidY(atKeyframe) - centroidY(drawn)),
      `the shape should have moved on the edited frame — drawn=${JSON.stringify(drawn)} after=${JSON.stringify(atKeyframe)}`,
    ).toBeGreaterThan(0.05);

    // back into the middle of the span: the vertex should sit BETWEEN the two
    // keyframes. Stale projection keeps painting the frame-1 shape instead.
    await stepBack(modal, 5);

    const mid = centroidY(await pointsOf(modal, id));
    const startY = centroidY(drawn);
    const endY = centroidY(atKeyframe);
    const lo = Math.min(startY, endY);
    const hi = Math.max(startY, endY);

    // strictly inside the span, and not sitting on either keyframe's value
    expect(
      mid,
      `mid-span centroid ${mid} should lie strictly between the keyframes ${lo}..${hi} — a stale canvas repeats one of them`,
    ).toBeGreaterThan(lo + 0.02);
    expect(mid).toBeLessThan(hi - 0.02);
  });

  test("scrubbing the span moves the shape continuously", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // The same defect stated as motion: walking backwards through the span, the
    // painted geometry must change on (nearly) every frame. A stale projection
    // repeats one shape.
    await openAnnotate(fiftyoneLoader, modal, page);

    const id = await drawPolyline(modal);
    await blur(page);

    const drawn = await pointsOf(modal, id);
    const toContainer = deriveToContainer(drawn as [number, number][]);

    await stepForward(modal, 10);
    await dragVertex(modal, id, toContainer);
    await blur(page);

    const seen: number[] = [];
    for (let i = 0; i < 9; i++) {
      await stepBack(modal, 1);
      seen.push(centroidY(await pointsOf(modal, id)));
    }

    const distinct = new Set(seen.map((v) => v.toFixed(4)));
    expect(
      distinct.size,
      `expected a distinct shape per frame across the span, saw ${JSON.stringify(seen)}`,
    ).toBeGreaterThan(5);
  });
});

test.describe("polyline track deletion on video", () => {
  test("Backspace deletes a selected polyline track on the first press", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // Reported: deleting a polyline track with Backspace took two rounds of
    // select-then-press before the track went away.
    await openAnnotate(fiftyoneLoader, modal, page);

    const id = await drawPolyline(modal);
    await blur(page);
    await modal.videoAnnotate.assert.objectTrackCount(2);

    // a body click selects the shape without sub-selecting a vertex, so
    // Backspace reads as "delete the track", not "remove a vertex"
    await modal.sampleCanvas.click(BODY[0], BODY[1]);
    await page.keyboard.press("Backspace");

    await expect
      .poll(
        () => polylineIds(modal),
        "the drawn track should leave the canvas on the first press",
      )
      .not.toContain(id);
    await modal.videoAnnotate.assert.objectTrackCount(1);
    // the delete flushes before the test ends
    await modal.sidebar.annotate.waitForSavesSettled();
  });
});
