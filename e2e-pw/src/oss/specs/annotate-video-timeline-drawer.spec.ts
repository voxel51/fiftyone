/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The video-annotation tracks drawer opens CLOSED by default (a global user
 * preference persisted across samples). While closed, a track's interval bar
 * stays mounted but non-interactive; it becomes clickable again only after
 * pinning the row into the header or opening the drawer. This covers both
 * routes back to an actionable track.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-timeline-drawer",
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

test.beforeEach(async ({ videoAnnotateSDK }) => {
  // one tracked vehicle (index=1) on every frame; no TDs so the timeline holds
  // a single object track.
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip],
    withEvents: false,
    trackedSampleIndices: [0],
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

test.describe.serial("video annotation timeline drawer", () => {
  test("starts closed; pinning a track makes its row actionable in the header", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    const [trackId] = await va.objectTrackIds();

    // closed by default: the bar is on-screen but can't be interacted with
    await va.assert.trackBarActionable(trackId, false);

    // pinning lifts the row into the always-visible header, drawer still closed
    await va.pinTrack(trackId);
    await va.assert.trackBarActionable(trackId, true);
  });

  test("opening the drawer manually reveals an unpinned track for interaction", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    const [trackId] = await va.objectTrackIds();

    await va.assert.trackBarActionable(trackId, false);

    // opening the drawer brings the unpinned row into the interactive body
    await va.openTracksDrawer();
    await va.assert.trackBarActionable(trackId, true);

    // and it's fully interactive there — delete the whole track from the menu
    await va.deleteTrackViaContextMenu(trackId);
    await va.assert.objectTrackCount(0);
  });
});
