/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Temporal-detection (TD) membership on the video-annotation surface: the
 * annotate sidebar lists a sample-level TD only while the playhead is inside
 * that TD's `support` span (support-gated engine presence), and re-derives as
 * the playhead moves. The three seeded events (approach / pass / depart) split
 * the clip into thirds, so each is listed only within its own third.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-temporal");
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
  // 20 frames @ 10fps; events split into thirds:
  // approach [1,6], pass [7,13], depart [14,20].
  await videoAnnotateSDK.seed({ datasetName, videoPaths: [clip] });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe.serial("video temporal-detection membership", () => {
  test("the sidebar lists a temporal detection only inside its support", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    const va = modal.videoAnnotate;

    // three TD interval rows on the timeline regardless of the playhead
    await va.assert.temporalTrackCount(3);

    const stepForward = async (n: number) => {
      for (let i = 0; i < n; i++) {
        await va.stepForward();
      }
    };

    // initial frame is inside "approach" [1,6]
    await va.assert.labelListed("approach");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("depart", false);

    // step into the "pass" third [7,13]
    await stepForward(8);
    await va.assert.labelListed("pass");
    await va.assert.labelListed("approach", false);
    await va.assert.labelListed("depart", false);

    // step into the "depart" third [14,20]
    await stepForward(8);
    await va.assert.labelListed("depart");
    await va.assert.labelListed("pass", false);
    await va.assert.labelListed("approach", false);
  });
});
