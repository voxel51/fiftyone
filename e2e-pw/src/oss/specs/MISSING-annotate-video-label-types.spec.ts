/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Rendering of non-box label types on the video-annotation surface. A sample is
 * seeded with TWO existing per-frame tracks — a detection carrying an instance
 * mask, and a polyline — across two active `frames.*` label fields. Both must
 * render: the multi-field frame seed registers every active per-frame label
 * field (not just `frames.detections`) with its real `LabelType`, so the engine
 * holds polylines + masks and the surface-agnostic engine→lighter bridge paints
 * them and the sidebar lists them.
 *
 * Read signals (semantic, engine-derived):
 *   - the sidebar lists a row per present label across ALL active frame fields
 *     (`useEntries` walks `engine.getPresent()` filtered by active schema +
 *     a known `getLabelType`) — a polyline only lists when its field is
 *     registered + seeded, so listing it proves the multi-field seed.
 *   - mask presence is read off the label menu (`Edit/Header.tsx`): "Remove
 *     mask" for a masked detection, "Add mask" for a maskless one.
 *
 * Create/paint round-trips (drawing a polyline, painting a mask) live in
 * `MISSING-annotate-video-label-types-create.spec.ts`.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-label-types"
);

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
  // sample 0: a masked detection track (vehicle) + a polyline track (person),
  // each a single instance present on every frame.
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    trackedSampleIndices: [0],
    maskedSampleIndices: [0],
    polylineSampleIndices: [0],
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked video sample. */
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

test.describe.serial("video non-box label rendering", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
  });

  test("existing detection and polyline labels both render in the sidebar", async ({
    modal,
  }) => {
    // The polyline only lists if `frames.polylines` was registered + seeded
    // into the engine alongside `frames.detections` — i.e. the multi-field seed.
    await modal.videoAnnotate.assert.labelListed("vehicle");
    await modal.videoAnnotate.assert.labelListed("person");
  });

  test("the polyline appears as its own timeline track", async ({ modal }) => {
    // Two instances on two fields (detection index=1, polyline index=2) → two
    // object tracks. Single-field track building would show only the detection.
    await modal.videoAnnotate.assert.objectTrackCount(2);
  });

  test("an existing instance mask renders on the detection", async ({
    modal,
  }) => {
    await modal.videoAnnotate.selectLabel("vehicle");
    await modal.sidebar.edit.assert.hasMask(true);
  });

  test("an existing polyline is selectable and opens its editor", async ({
    modal,
  }) => {
    await modal.videoAnnotate.selectLabel("person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
  });

  test("selecting a polyline from its timeline track drives the other surfaces", async ({
    modal,
  }) => {
    // Read the polyline's instance id from the list first (selecting a label
    // swaps the list for its editor), then start on a different label so the
    // timeline click must change the selection.
    const instanceId = await modal.videoAnnotate.labelRowId("person");
    await modal.videoAnnotate.selectLabel("vehicle");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");

    // Clicking a timeline row writes engine interaction; the editor follows the
    // anchor. The row must address the polyline's OWN field path (`frames.polylines`)
    // — a row keyed to the detections field would select nothing, leaving the
    // editor on "vehicle".
    await modal.videoAnnotate.clickTrack(instanceId);
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
  });

  test("the annotate surface exposes mask + polyline create modes", async ({
    page,
  }) => {
    // The video surface used to show only Detection; masks (Segmentation mode)
    // and polylines are now ungated alongside it.
    await expect(page.getByTestId("detection-mode")).toBeVisible();
    await expect(page.getByTestId("segmentation-mode")).toBeVisible();
    await expect(page.getByTestId("polyline-mode")).toBeVisible();
  });

  test("polyline create mode activates on the video surface", async ({
    modal,
    page,
  }) => {
    // The mode only enters (active flips true) when an active polyline field
    // exists and the button isn't disabled — i.e. create is wired for video.
    await modal.sidebar.annotate.polylineMode();
    await expect(page.getByTestId("polyline-mode")).toHaveAttribute(
      "data-cy-active",
      "true"
    );
  });
});
