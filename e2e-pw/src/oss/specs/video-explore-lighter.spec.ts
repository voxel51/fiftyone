/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Video Explore paints labels on a Lighter canvas stacked over the `<video>`.
 * The canvas must track the media rect through a resize, labels must paint
 * inside it, zoom and pan must move them with the picture, and hovering a
 * label must open its tooltip.
 */
import { test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("video-explore-lighter");

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: { "frames.detections": "Detections" },
    // one centered box on every frame, so any frame the player lands on
    // paints the same label
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({ label: "box", bounding_box: [0.25, 0.25, 0.5, 0.5] }),
      ]),
    }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ fiftyoneLoader, grid, modal, page }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();
});

test.afterEach(async ({ modal, page }) => {
  await modal.close({ ignoreError: true });
  await page.reload();
});

test.describe.serial("video Explore Lighter surface", () => {
  test("labels paint over the media and follow a resize", async ({
    modal,
    page,
  }) => {
    await modal.sampleCanvas.assert.hasScreenshot("video-explore-labels.png");
    await modal.sampleCanvas.assert.lighterCoversMedia();

    const viewport = page.viewportSize();
    await page.setViewportSize({
      width: viewport.width - 300,
      height: viewport.height - 200,
    });

    await modal.sampleCanvas.assert.hasScreenshot("video-explore-resized.png");
    await modal.sampleCanvas.assert.lighterCoversMedia();
  });

  test("wheel zooms and drag pans the media with its labels", async ({
    modal,
  }) => {
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.wheel(7);
    await modal.sampleCanvas.assert.hasScreenshot("video-explore-zoomed.png");

    await modal.sampleCanvas.drag(0.5, 0.5, 0.7, 0.5);
    await modal.sampleCanvas.assert.hasScreenshot("video-explore-panned.png");
  });

  test("hovering a label opens its tooltip", async ({ modal }) => {
    await modal.sampleCanvas.move(0.5, 0.5);
    await modal.sampleCanvas.tooltip.assert.isVisible(true);
  });
});
