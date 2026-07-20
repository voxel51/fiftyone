/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Timeline audio controls on the video-annotation surface (FOEPD-4226): a
 * source video carrying an audio track shows the volume group in the
 * timeline controls, muted by default; a silent video shows no volume UI at
 * all — no disabled control, no indicator. Both directions are driven by the
 * native-decode probe's mp4box track table.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-audio");

// mp4 so the decode probe's demux verdict drives the volume UI in both
// directions. Sample i has ObjectId(f"{i:024x}").
const audibleClip = `/tmp/${datasetName}-audible.mp4`;
const silentClip = `/tmp/${datasetName}-silent.mp4`;
const audibleId = "000000000000000000000000";
const silentId = "000000000000000000000001";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory, videoAnnotateSDK }) => {
  await foWebServer.startWebServer();
  const clip = {
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  };
  await mediaFactory.createVideo({
    ...clip,
    outputPath: audibleClip,
    audio: true,
  });
  await mediaFactory.createVideo({ ...clip, outputPath: silentClip });
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [audibleClip, silentClip],
    withEvents: false,
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

/** Open the modal in annotate mode on the deep-linked video sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page,
  id: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

test.describe("timeline audio controls", () => {
  // playback renders `data-testid`; this suite's `getByTestId` is `data-cy`
  const volumeGroup = (page: import("src/oss/fixtures").Page) =>
    page.locator('[data-testid="timeline-controls-volume-group"]');

  test("a video with an audio track shows the volume group, muted by default", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, audibleId);

    await expect(volumeGroup(page)).toBeVisible();

    const mute = page.locator('[data-testid="timeline-controls-mute"]');
    await expect(mute).toHaveAttribute("aria-label", "Unmute");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
  });

  test("a silent video shows no volume UI at all", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, silentId);

    // controls render; the volume group never mounts
    await expect(
      page.locator('[data-testid="timeline-controls-root"]').first(),
    ).toBeVisible();
    await expect(volumeGroup(page)).toHaveCount(0);
  });
});
