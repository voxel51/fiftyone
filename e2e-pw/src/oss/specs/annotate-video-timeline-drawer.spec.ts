/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The video tracks drawer opens closed by default (a persisted user
 * preference), and a closed drawer keeps a track's interval bar mounted but
 * non-interactive. Pinning the row into the header or opening the drawer are
 * the two routes back to an actionable track.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";
import { videoAnnotationSeed } from "./annotate-video/seed";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-timeline-drawer",
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

test.beforeEach(async ({ datasetFactory }) => {
  // one tracked vehicle (index=1) on every frame; no TDs so the timeline holds
  // a single object track.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    ...videoAnnotationSeed({
      withEvents: false,
      trackedSampleIndices: [0],
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
