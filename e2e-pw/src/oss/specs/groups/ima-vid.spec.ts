import { test as base, expect } from "src/oss/fixtures";
import { DynamicGroupPom } from "src/oss/poms/action-row/dynamic-group";
import { GridActionsRowPom } from "src/oss/poms/action-row/grid-actions-row";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { SidebarPom } from "src/oss/poms/sidebar";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { createBlankImage } from "src/shared/media-factory/image";

const NUM_VIDEOS = 2;
const FRAME_COLORS = {
  0: "#ff0000",
  1: "#00ff00",
};
const NUM_FRAMES_PER_VIDEO = 150;

const datasetName = getUniqueDatasetNameWithPrefix(`group-ima-vid`);
const test = base.extend<{
  grid: GridPom;
  modal: ModalPom;
  gridActionsRow: GridActionsRowPom;
  sidebar: SidebarPom;
  dynamicGroups: DynamicGroupPom;
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
  gridActionsRow: async ({ eventUtils, page }, use) => {
    await use(new GridActionsRowPom(page, eventUtils));
  },
  dynamicGroups: async ({ eventUtils, page }, use) => {
    await use(new DynamicGroupPom(page, eventUtils));
  },
});

const writeFrames = async () => {
  const start = performance.now();
  const createPromises = [];
  for (let i = 1; i <= NUM_VIDEOS; ++i) {
    for (let j = 1; j <= NUM_FRAMES_PER_VIDEO; ++j) {
      createPromises.push(
        createBlankImage({
          outputPath: `/tmp/ima-vid-${i}-${j}.png`,
          width: 50,
          height: 50,
          fillColor: FRAME_COLORS[i % 2],
          watermarkString: `${j}`,
          hideLogs: true,
        })
      );
    }
  }
  await Promise.all(createPromises);
  const end = performance.now();
  console.log(
    `Wrote ${NUM_VIDEOS * NUM_FRAMES_PER_VIDEO} frames in ${
      end - start
    } milliseconds`
  );
};

test.beforeAll(async ({ fiftyoneLoader }) => {
  await writeFrames();

  await fiftyoneLoader.executePythonCode(`
    import fiftyone as fo
    dataset = fo.Dataset("${datasetName}")
    dataset.persistent = True
    samples = []

    for i in range(1, ${NUM_VIDEOS + 1}):
      for j in range(1, ${NUM_FRAMES_PER_VIDEO + 1}):
        sample = fo.Sample(
          filepath=f"/tmp/ima-vid-{i}-{j}.png",
          frame_number=j,
          video_id=i,
          label=fo.Detection(
                label=f"box-{i}-{j}",
                bounding_box=[0.1, 0.1, 0.2, 0.2]
              )
        )
        samples.append(sample)
    dataset.add_samples(samples)
    `);
});

test.beforeEach(
  async ({ page, fiftyoneLoader, gridActionsRow, dynamicGroups, grid }) => {
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName);

    await gridActionsRow.toggleCreateDynamicGroups();
    await dynamicGroups.groupBy.openResults();
    await dynamicGroups.groupBy.selectResult("video_id");
    await dynamicGroups.groupBy.closeResults();
    await dynamicGroups.selectTabOption("Ordered");
    await dynamicGroups.orderBy.openResults();
    await dynamicGroups.orderBy.selectResult("frame_number");
    await dynamicGroups.orderBy.closeResults();
    const gridRefreshPromiseCreateDynamicGroups =
      grid.getWaitForGridRefreshPromise();
    await dynamicGroups.submit();
    await gridRefreshPromiseCreateDynamicGroups;

    const gridRefreshPromiseSetRenderFramesAsVideo =
      grid.getWaitForGridRefreshPromise();
    await grid.actionsRow.toggleDisplayOptions();
    await grid.actionsRow.displayActions.toggleRenderFramesAsVideo();
    await gridRefreshPromiseSetRenderFramesAsVideo;

    await grid.assert.isEntryCountTextEqualTo("2 groups");
    await grid.assert.isLookerCountEqualTo(2);
  }
);

test("check modal playback and tagging behavior", async ({ modal, grid }) => {
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute();

  await modal.video.assert.isTimeTextEqualTo("1 / 150");

  // change speed to the low for easy testing
  await modal.video.setSpeedTo("low");

  await modal.video.playUntilFrames("3 / 150");

  // verify it's the third frame that's rendered
  await expect(modal.looker).toHaveScreenshot("ima-vid-1-3.png", {
    mask: [modal.video.controls],
    animations: "allow",
  });
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "3");
  await modal.sidebar.assert.verifySidebarEntryText("video_id", "1");

  // tag current frame and ensure sidebar updates
  const currentSampleTagCount = await modal.sidebar.getSampleTagCount();
  await modal.tagger.toggleOpen();
  await modal.tagger.switchTagMode("sample");
  await modal.tagger.addSampleTag("tag-1-3");
  await modal.sidebar.assert.verifySampleTagCount(currentSampleTagCount + 1);

  // skip a couple of frames and see that sample tag count is zero
  await modal.video.playUntilFrames("5 / 150");
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "5");
  await modal.sidebar.assert.verifySidebarEntryText("video_id", "1");
  await modal.sidebar.assert.verifySampleTagCount(0);

  // verify label is rendering in this frame, too
  await expect(modal.looker).toHaveScreenshot("ima-vid-1-5.png", {
    mask: [modal.video.controls],
    animations: "allow",
  });

  // tag label and see that sidebar updates
  const currentLabelTagCount = await modal.sidebar.getLabelTagCount();
  await modal.tagger.toggleOpen();
  await modal.tagger.switchTagMode("label");
  await modal.tagger.addLabelTag("box-1-5");
  await modal.sidebar.assert.verifyLabelTagCount(currentLabelTagCount + 1);

  // skip a couple of frames and see that label tag count is zero
  await modal.video.playUntilFrames("7 / 150");
  await modal.sidebar.assert.verifySidebarEntryText("frame_number", "7");
  await modal.sidebar.assert.verifySidebarEntryText("video_id", "1");
});
