/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Presented-frame lock: `useCurrentFrame` — the single source of "current
 * frame" for the engine clock and the temporal-detection sidebar gates —
 * follows the frame actually on glass (the ImaVid tile publishes the painted
 * bitmap's time into `presentedTimeAtom`), falling back to the playhead.
 * The sidebar's in-support TD listing is the frame-derived UI this exercises.
 *
 * Guards the two regressions the presented-frame preference can introduce:
 *
 *  - an off-by-one in the tile's publisher (`(frameNumber - 1) / fps`): every
 *    frame-derived consumer would shift by one frame, so the TD boundary
 *    frames (approach [1,6] / pass [7,13] / depart [14,20]) would gate the
 *    sidebar one frame early. Exact single-frame steps across the 6→7
 *    boundary catch it in both directions.
 *  - stale presented time across a sample switch: if the tile failed to clear
 *    the atom (or republish the new sample's paint), paging to the next video
 *    would keep frame-derived UI on the PREVIOUS sample's late frame instead
 *    of the fresh sample's frame 1.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-presented-frame",
);
const sample0Id = "000000000000000000000000";
const clip0 = `/tmp/${datasetName}-0.webm`;
const clip1 = `/tmp/${datasetName}-1.webm`;

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip0,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
  await mediaFactory.createVideo({
    outputPath: clip1,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#a05030",
  });
  // 20 frames per clip -> demo TDs approach [1,6], pass [7,13], depart [14,20].
  // Both tests are read-only navigation, so a single seed serves the file.
  await videoAnnotateSDK.seed({ datasetName, videoPaths: [clip0, clip1] });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const openAnnotateSurface = async (modal: ModalPom) => {
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

const openAnnotateDeepLink = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: sample0Id }),
  });
  await openAnnotateSurface(modal);
};

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepForward();
  }
};

test.describe.serial("video annotation presented-frame lock", () => {
  test("TD sidebar gates track exact frame steps and a ruler seek", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotateDeepLink(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    // frame 1: only "approach" [1,6] is in support
    await va.assert.labelListed("approach");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("depart", false);

    // six exact steps -> frame 7, the first "pass" frame. The positive poll
    // ("pass" appears) is the signal the steps landed; only then is the
    // negative ("approach" gone) meaningful.
    await stepForward(modal, 6);
    await va.assert.labelListed("pass");
    await va.assert.labelListed("approach", false);

    // one step back -> frame 6, the LAST "approach" frame. A one-frame-late
    // publisher would still present frame 7 here and keep "pass" listed.
    await va.stepBack();
    await va.assert.labelListed("approach");
    await va.assert.labelListed("pass", false);

    // a real ruler-click scrub into the "depart" third [14,20] — the seek
    // path where the picture trails the requested playhead
    await va.seekToRulerFraction(0.9);
    await va.assert.labelListed("depart");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("approach", false);
  });

  test("paging to the next sample presents ITS frame 1, not a stale late frame", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    // open from the grid so the modal carries the sample sequence
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      withGrid: true,
    });
    await grid.openFirstSample();
    await openAnnotateSurface(modal);
    const va = modal.videoAnnotate;

    // scrub sample 0 deep into its "depart" third [14,20]
    await stepForward(modal, 13);
    await va.assert.labelListed("depart");
    const firstSampleTds = new Set(await va.temporalTrackIds());

    // page to the next video sample (ArrowRight = ModalNextSample); its TD
    // ids are distinct, so all-new ids prove the surface switched samples
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => {
        const ids = await va.temporalTrackIds();
        return ids.length === 3 && ids.every((t) => !firstSampleTds.has(t));
      })
      .toBe(true);
    await va.waitForSurface();

    // the fresh sample presents from ITS frame 1 — a stale presented time
    // from sample 0 would keep the sidebar gated to the depart third
    await va.assert.labelListed("approach");
    await va.assert.labelListed("depart", false);
  });
});
