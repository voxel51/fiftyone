/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Polyline keyframe interpolation on the video surface and whether the canvas
 * shows it: after a second keyframe, scrubbing back through the span was
 * correct in the store and in Explore but the annotate canvas kept its stale
 * shape. Exact captures of the drawn shape, the second keyframe and the middle
 * of the span hold the canvas to the interpolated geometry.
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

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ datasetFactory }) => {
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    // .mp4 so the surface takes the mp4/native decode path the reported clip
    // uses; ~180 frames @ 30fps, matching the reported clip's shape (the
    // 10fps/40-frame variant of this spec passes, so frame rate / clip length
    // is a suspect)
    videoOptions: { container: "mp4", duration: 6, frameRate: 30 },
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
      "frames.polylines": "Polylines",
      "frames.polylines.polylines.instance": "Instance",
      "frames.polylines.polylines.keyframe": "BooleanField",
      "frames.polylines.polylines.propagation": "DictField",
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
      "frames.polylines": {
        type: "polylines",
        component: "dropdown",
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "index", type: "int", component: "text" },
        ],
      },
    },
    // the reported sample carried several other polyline tracks; a pre-seeded
    // track makes the drawn one share the surface, as it did there
    withFrameData: (_, { label }) => ({
      detections: label.detections([]),
      polylines: label.polylines([
        label.polyline({
          label: "person",
          points: [
            [
              [0.2, 0.2],
              [0.5, 0.2],
              [0.35, 0.5],
            ],
          ],
          closed: true,
          filled: false,
          index: 2,
          instance: label.instance("person-polyline-2"),
        }),
      ]),
    }),
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
  await modal.videoAnnotate.afterSurface(() =>
    modal.sidebar.switchMode("annotate"),
  );
};

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const ofOverlay =
  (id: string) =>
  (e: { detail?: unknown }): boolean =>
    (e.detail as { id?: string } | undefined)?.id === id;

// once received, the overlay is selected whatever its prior state
const clickOverlay = (modal: ModalPom, id: string) =>
  modal.eventUtils.after(
    "lighter:overlay-click",
    () => modal.sampleCanvas.click(BODY[0], BODY[1]),
    ofOverlay(id),
  );

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
  // the surface reveals once its tracks resolve, and the draw resolves once the
  // new track is on the timeline; a track's id is its overlay's id
  const before = new Set(await modal.videoAnnotate.objectTrackIds());

  await modal.sidebar.annotate.polylineMode();
  const [first, ...rest] = DRAWN;
  await modal.videoAnnotate.afterTracksChange(() =>
    modal.sampleCanvas.click(...first),
  );
  for (const point of rest) {
    await modal.sampleCanvas.click(...point);
  }
  await modal.sampleCanvas.rightClick(0.9, 0.1);
  await modal.sidebar.annotate.polylineMode();

  const drawn = (await modal.videoAnnotate.objectTrackIds()).filter(
    (id) => !before.has(id),
  );
  expect(drawn, "the drawn polyline should be one new overlay").toHaveLength(1);

  return drawn[0];
};

/**
 * Drag the first drawn vertex upwards on the current frame, promoting it to a
 * keyframe; resolves once the edit is saved. The frame must still show the
 * shape as drawn, so the vertex sits where it was clicked.
 *
 * A vertex drag specifically: dragging the shape's BODY is silently ignored on a
 * non-keyframe frame (worth its own investigation), whereas a vertex drag
 * commits there — which is also the gesture the bug report used.
 */
const dragVertex = async (modal: ModalPom, id: string) => {
  // a vertex is only grabbable once its overlay is selected
  await clickOverlay(modal, id);

  const [vx, vy] = DRAWN[0];
  await modal.sidebar.annotate.afterSave(async () => {
    await modal.sampleCanvas.move(vx, vy);
    await modal.sampleCanvas.down();
    for (const step of [0.15, 0.45, 0.75, 1]) {
      await modal.sampleCanvas.move(vx, vy - DRAG_DY * step);
    }
    await modal.sampleCanvas.up();
  });
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
    await modal.sampleCanvas.assert.hasMediaScreenshot("drawn.png");

    // second keyframe 10 frames along, where the shape still holds as drawn
    await stepForward(modal, 10);
    await dragVertex(modal, id);
    await blur(page);
    await modal.sampleCanvas.assert.hasMediaScreenshot("second-keyframe.png");

    // back into the middle of the span the shape sits between the keyframes;
    // a stale projection keeps painting one of them
    await stepBack(modal, 5);
    await modal.sampleCanvas.assert.hasMediaScreenshot("mid-span.png");
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
    await clickOverlay(modal, id);

    // received only if the first press deleted the track; the delete
    // flushes before the test ends
    await modal.sidebar.annotate.afterSave(() =>
      modal.videoAnnotate.afterTracksChange(() =>
        modal.eventUtils.after(
          "lighter:overlay-removed",
          () => page.keyboard.press("Backspace"),
          ofOverlay(id),
        ),
      ),
    );
    await modal.videoAnnotate.assert.objectTrackCount(1);
  });
});
