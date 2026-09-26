/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One pass over what a temporal tag on a video dataset is for: it is drawn on
 * the modal's timeline, it appears on that sample's grid tile once the modal is
 * closed, and it is still on the tile after a reload — which is the only part
 * that proves it reached the tag routes rather than living in App state.
 *
 * The tile lane is the point of the feature, so its mark is checked against the
 * clip's own axis: the lane is scaled by the video's duration, not by the
 * extent of whichever tags happen to exist.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { DatasetFactory } from "src/shared/dataset-factory";

const videoDataset = getUniqueDatasetNameWithPrefix("temporal-tags-video");

// `read_only` is required on an id attribute; the schema validator rejects a
// bare one.
const ID_ATTRIBUTE = {
  name: "id",
  type: "id",
  component: "text",
  read_only: true,
};

const TAG = "review";

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

  test("a tag drawn in the modal lands on the tile and survives a reload", async ({
    fiftyoneLoader,
    grid,
    modal,
    page,
    sidebar,
  }) => {
    // Counted while no tag exists, so the count checked once the modal closes
    // is only right if the tag mutation itself refetched it.
    await sidebar.clickFieldDropdown("_temporal_tags");
    await expect(
      page.getByTestId("categorical-filter-_temporal_tags"),
    ).toContainText("No results");

    await grid.openFirstSample();
    await modal.waitForSampleLoadDomAttribute();
    await modal.sidebar.switchMode("annotate");
    await modal.videoAnnotate.waitForSurface();

    await modal.videoAnnotate.createTemporalTag(TAG);

    await expect
      .poll(async () => await modal.videoAnnotate.temporalTagTrackIds())
      .toEqual([`temporal-tag::${TAG}`]);

    await modal.close({ ignoreError: true });

    // The lane draws only for tags the sidebar has active, the same gate the
    // multimodal grid uses.
    await sidebar.clickFieldCheckbox("_temporal_tags");

    await expect.poll(async () => await grid.temporalTagMarkCount()).toBe(1);

    await expect(
      await sidebar.getAttributeItemCount("_temporal_tags", TAG),
    ).toHaveText("1");

    // A reload keeps nothing client-side, so a mark that comes back was read
    // from the tag routes.
    await fiftyoneLoader.waitUntilGridVisible(page, videoDataset);

    await expect.poll(async () => await grid.temporalTagMarkCount()).toBe(1);

    // On the clip's axis, not the tags': a lane scaled to its only tag would
    // run that tag's mark all the way to the right edge.
    const { left, width } = await grid.temporalTagMarkGeometry();
    expect(left + width).toBeLessThan(99);
  });
});
