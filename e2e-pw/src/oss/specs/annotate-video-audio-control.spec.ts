/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Timeline audio controls on the video-annotation surface (FOEPD-4226): a video
 * with an audio track shows the volume group muted by default, a silent video
 * shows no volume UI at all. Both are driven by the native-decode probe's
 * mp4box track table.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-audio");

// Sample i has ObjectId(f"{i:024x}").
const audibleId = "000000000000000000000000";
const silentId = "000000000000000000000001";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  // mp4 so the decode probe's demux verdict drives the volume UI in both
  // directions; only sample 0 carries an audio track.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    numSamples: 2,
    videoOptions: (index) => ({ container: "mp4", audio: index === 0 }),
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
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
    },
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
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
  const volumeControl = (page: import("src/oss/fixtures").Page) =>
    page.locator('[data-testid="timeline-controls-volume-control"]');

  test("a video with an audio track shows the volume control, muted by default", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, audibleId);

    // No popover: the mute button sits directly in the toolbar and grows the
    // fader on hover. It is labelled by its channel ("Master").
    await expect(volumeControl(page)).toBeVisible();

    const mute = page.locator('[data-testid="timeline-controls-mute"]');
    await expect(mute).toBeVisible();
    await expect(mute).toHaveAttribute("aria-label", "Unmute Master");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
  });

  test("a silent video shows no volume UI at all", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, silentId);

    // controls render; the volume control never mounts
    await expect(
      page.locator('[data-testid="timeline-controls-root"]').first(),
    ).toBeVisible();
    await expect(volumeControl(page)).toHaveCount(0);
    await expect(
      page.locator('[data-testid="timeline-controls-mute"]'),
    ).toHaveCount(0);
  });
});
