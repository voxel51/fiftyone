import { test as base } from "src/oss/fixtures";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const NUM_VIDEOS = 2;
const FRAME_COLORS = ["#ff0000", "#00ff00"];
const NUM_FRAMES_PER_VIDEO = 50;
const frameText = (frame: number) => `${frame} / ${NUM_FRAMES_PER_VIDEO}`;

const datasetName = getUniqueDatasetNameWithPrefix(`group-ima-vid`);
const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  gridActionsRow: GridActionsRowPom;
  sidebar: SidebarPom;
}>({
  grid: async ({ eventUtils, page }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
  sidebar: async ({ page }, use) => {
    await use(new SidebarPom(page));
  },
  gridActionsRow: async ({ page }, use) => {
    await use(new GridActionsRowPom(page));
  },
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // sample index = (video - 1) * NUM_FRAMES_PER_VIDEO + frame - 1
  const video = (index: number) => Math.floor(index / NUM_FRAMES_PER_VIDEO) + 1;
  const frame = (index: number) => (index % NUM_FRAMES_PER_VIDEO) + 1;
  await datasetFactory.createDataset({
    datasetName,
    numSamples: NUM_VIDEOS * NUM_FRAMES_PER_VIDEO,
    imageOptions: (index) => ({
      width: 50,
      height: 50,
      fillColor: FRAME_COLORS[video(index) % 2],
      watermarkString: `${frame(index)}`,
      hideLogs: true,
    }),
    schema: {
      frame_number: "IntField",
      video_id: "IntField",
      label: "Detection",
    },
    withSampleData: ({ index }, { label }) => ({
      frame_number: frame(index),
      video_id: video(index),
      label: label.detection({
        label: `box-${video(index)}-${frame(index)}`,
        bounding_box: [0.1, 0.1, 0.2, 0.2],
      }),
    }),
    savedViews: {
      groups: 'dataset.group_by("video_id", order_by="frame_number")',
    },
  });
});

test.beforeEach(async ({ page, fiftyoneLoader, grid }) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ view: "groups" }),
  });

  await grid.afterEntryCounts(() =>
    grid.run(async () => {
      await grid.actionsRow.toggleDisplayOptions();
      await grid.actionsRow.displayActions.toggleRenderFramesAsVideo();
    }),
  );

  await grid.assert.isEntryCountTextEqualTo(`${NUM_VIDEOS} groups`);
  await grid.assert.isTileCountEqualTo(NUM_VIDEOS);
});

// flaky: intermittently fails during modal playback
test.skip("check modal playback and tagging behavior", async ({
  modal,
  grid,
}) => {
  await modal.imavid.afterFrameText(frameText(1), () =>
    modal.afterSampleLoaded(() => grid.openFirstSample()),
  );

  const tagged = await modal.imavid.playUntilFrames(frameText(13));

  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame_number: String(tagged),
    video_id: "1",
  });

  // tag current frame and ensure sidebar updates
  const currentSampleTagCount = await modal.sidebar.getSampleTagCount();
  const tags = String(currentSampleTagCount + 1);
  await modal.tagger.toggleOpen();
  await modal.tagger.switchTagMode("sample");
  await modal.sidebar.afterEntries({ tags }, () =>
    modal.tagger.addSampleTag("tag-1-13"),
  );
  await modal.sidebar.assert.verifySampleTagCount(currentSampleTagCount + 1);

  // skip a couple of frames and see that sample tag count is zero
  let untagged = 0;
  await modal.sidebar.afterEntries({ tags: "0" }, async () => {
    untagged = await modal.imavid.playUntilFrames(frameText(20));
  });
  await modal.sidebar.assert.verifySidebarEntryTexts({
    frame_number: String(untagged),
    video_id: "1",
  });
  await modal.sidebar.assert.verifySampleTagCount(0);
});
