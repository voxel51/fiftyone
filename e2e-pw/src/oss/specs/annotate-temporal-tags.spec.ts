/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Temporal tags on the video timeline, as regression cover for three things
 * that have broken:
 *
 * 1. A tag must be written against the sample ON SCREEN. On a grouped dataset
 *    the modal can display the video slice while the grid sits on another, and
 *    the write used to follow the grid's sample.
 * 2. The grid filter must match a tagged group from ANY slice. Tags live on one
 *    slice's sample, so matching sample ids alone emptied the grid everywhere
 *    else.
 * 3. A created tag must survive a modal reopen — the only check here that goes
 *    through the tag REST routes end to end rather than App state.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { DatasetFactory } from "src/shared/dataset-factory";

const videoDataset = getUniqueDatasetNameWithPrefix("temporal-tags-video");
const groupDataset = getUniqueDatasetNameWithPrefix("temporal-tags-group");

// The factory ids samples by creation index, and creates them slice by slice
// in the order `slices` declares. `image` is declared first so it is also the
// DEFAULT slice: the grid opens on it, which is the whole point of the grouped
// cases below.
// `read_only` is required on an id attribute; the schema validator rejects a
// bare one.
const ID_ATTRIBUTE = {
  name: "id",
  type: "id",
  component: "text",
  read_only: true,
};

const GROUP_0_IMAGE = "000000000000000000000000";
const GROUP_0_VIDEO = "000000000000000000000001";

const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ page, eventUtils }, use) => use(new GridPom(page, eventUtils)),
  modal: async ({ page, eventUtils }, use) =>
    use(new ModalPom(page, eventUtils)),
  sidebar: async ({ page }, use) => use(new SidebarPom(page)),
});

const seedVideoDataset = (datasetFactory: typeof DatasetFactory) =>
  datasetFactory.createDataset({
    mediaType: "video",
    datasetName: videoDataset,
    numSamples: 1,
    sampleFrames: true,
    videoOptions: { frameRate: 5 },
    schema: { "frames.detections": "Detections" },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["vehicle"],
        attributes: [ID_ATTRIBUTE],
      },
    },
  });

const seedGroupDataset = (datasetFactory: typeof DatasetFactory) =>
  datasetFactory.createDataset({
    mediaType: "group",
    datasetName: groupDataset,
    numGroups: 2,
    slices: [
      {
        name: "image",
        mediaType: "image",
        imageOptions: { width: 64, height: 64, fillColor: "#a03050" },
      },
      { name: "video", mediaType: "video", videoOptions: { frameRate: 5 } },
    ],
    schema: { "frames.detections": "Detections" },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["vehicle"],
        attributes: [ID_ATTRIBUTE],
      },
    },
    sampleFrames: true,
  });

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("video temporal tags", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await seedVideoDataset(datasetFactory);
    await fiftyoneLoader.waitUntilGridVisible(page, videoDataset);
    await modal.close({ ignoreError: true });
  });

  test("a created tag comes back from the server on reload", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
  }) => {
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    await modal.videoAnnotate.createTemporalTag("review");

    await expect
      .poll(async () => await modal.videoAnnotate.temporalTagTrackIds())
      .toEqual(["temporal-tag::review"]);

    // Reload rather than just reopen: no App state survives it, so a row that
    // comes back was read from the tag routes. The modal has to be shut first
    // or the grid click below lands on its overlay.
    await modal.close({ ignoreError: true });
    await fiftyoneLoader.waitUntilGridVisible(page, videoDataset);
    await grid.openFirstSample();
    // Annotate mode is a persisted preference, so the modal reopens straight
    // into it and never stamps the sample-load attribute. Waiting on the
    // surface is both sufficient and what this assertion actually needs.
    await modal.videoAnnotate.waitForSurface();

    await expect
      .poll(async () => await modal.videoAnnotate.temporalTagTrackIds())
      .toEqual(["temporal-tag::review"]);
  });
});

test.describe.serial("grouped temporal tags", () => {
  test.beforeEach(async ({ datasetFactory, fiftyoneLoader, modal, page }) => {
    await seedGroupDataset(datasetFactory);
    await fiftyoneLoader.waitUntilGridVisible(page, groupDataset);
    await modal.close({ ignoreError: true });
  });

  test("a tag is written against the displayed slice, not the grid's", async ({
    grid,
    modal,
  }) => {
    // The grid is on `image` (the default slice), so the modal opens with the
    // image sample as its selector. Switching the annotation slice to `video`
    // moves the surface but NOT that selector — the write has to follow the
    // surface.
    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");
    await modal.sidebar.annotate.selectAnnotationSlice("video");
    await modal.videoAnnotate.waitForSurface();

    const response = await modal.videoAnnotate.createTemporalTag("review");

    expect(response.url()).toContain(GROUP_0_VIDEO);
    expect(response.url()).not.toContain(GROUP_0_IMAGE);
  });

  test("the grid filter matches a tagged group from a non-video slice", async ({
    eventUtils,
    fiftyoneLoader,
    grid,
    page,
    sidebar,
  }) => {
    // Tag the VIDEO sample of the first group only. The grid is on `image`, so
    // a filter that matched sample ids would show nothing at all.
    await fiftyoneLoader.executePythonCode(`
      import fiftyone as fo
      import fiftyone.core.tags as fota

      dataset = fo.load_dataset("${groupDataset}")
      fota.add_temporal_tags(
          dataset,
          [fota.TemporalTag("${GROUP_0_VIDEO}", 0, 1_000_000_000, "review")],
      )
    `);
    await fiftyoneLoader.waitUntilGridVisible(page, groupDataset);

    await grid.assert.isTileCountEqualTo(2);

    // Both steps are animated/async: without arming first, the tile count is
    // read while the grid is still refreshing and sees zero.
    const expanded = await eventUtils.arm("animation-onRest");
    await sidebar.clickFieldDropdown("_temporal_tags");
    await expanded.received;

    const refreshed = await grid.armGridRefresh();
    await sidebar.applyFilter("review");
    await refreshed.received;

    // The group whose VIDEO slice carries the tag, shown at its image slice.
    await grid.assert.isTileCountEqualTo(1);
  });
});
