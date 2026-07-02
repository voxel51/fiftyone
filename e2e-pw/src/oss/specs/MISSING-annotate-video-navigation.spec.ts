/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Paging between video samples on the annotation surface. Regression guard for
 * the next/prev "a store for sample X is already registered" crash: on a sample
 * switch the 3D-scene store registration raced the video surface's own store
 * while the modal id was settling. Paging forward then back must re-home the
 * engine store cleanly — the surface re-renders each sample's own track and no
 * duplicate-store error is thrown.
 *
 * The modal is opened from the GRID (not a deep link) so it carries the sample
 * sequence — a deep-linked single sample has no next/previous sibling.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-nav");
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
  // both samples carry their own tracked instance, so the object track id
  // differs between samples — a reliable "the surface switched" signal.
  await videoAnnotateSDK.seed({
    datasetName,
    videoPaths: [clip0, clip1],
    trackedSampleIndices: [0, 1],
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("video annotation sample navigation", () => {
  test("paging next then prev re-homes the store without a duplicate-store crash", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    const storeErrors: string[] = [];
    page.on("pageerror", (e) => {
      if (/store|registered/i.test(e.message)) storeErrors.push(e.message);
    });

    // open the modal from the grid so it carries the sample sequence
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      withGrid: true,
    });
    await grid.openFirstSample();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    const va = modal.videoAnnotate;
    await va.assert.objectTrackCount(1);
    const [firstTrack] = await va.objectTrackIds();

    // page forward to the next video sample (ArrowRight = ModalNextSample)
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => {
        const ids = await va.objectTrackIds();
        return ids.length === 1 && ids[0] !== firstTrack;
      })
      .toBe(true);
    await va.waitForSurface();
    const [secondTrack] = await va.objectTrackIds();

    // page back to the first sample
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => {
        const ids = await va.objectTrackIds();
        return ids.length === 1 && ids[0] === firstTrack;
      })
      .toBe(true);
    await va.waitForSurface();

    expect(secondTrack).not.toBe(firstTrack);
    // no "a store for sample X is already registered" (or similar) was thrown
    expect(storeErrors).toEqual([]);
  });
});
