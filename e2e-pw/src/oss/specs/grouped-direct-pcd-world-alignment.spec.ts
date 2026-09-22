/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Two point-cloud slices with different static transforms render aligned in
 * the world frame.
 */
import { expect, test as base } from "src/oss/fixtures";
import { GridPom } from "src/oss/poms/grid";
import { ModalPom } from "src/oss/poms/modal";
import { Duration, getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "grouped-direct-pcd-world-alignment",
);
const QUARTER_TURN = [0, 0, 0.7071067811865476, 0.7071067811865476];

const SCENE_REVEALED = "looker3d-scene-ready";
// a reveal waits on a point-cloud fetch and a camera restore; Teams CI runs
// this same spec several times slower
const SIGNAL_DEADLINE = Duration.Seconds(20);

const test = base.extend<{ grid: GridPom; modal: ModalPom }>({
  grid: async ({ page, eventUtils }, use) => {
    await use(new GridPom(page, eventUtils));
  },
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/**
 * Fail with `reason` instead of hanging. The 3D viewer skips its camera and
 * reveal signals silently when the scene is mid-swap, and an unbounded wait on
 * one of them burns the whole test timeout without naming what never arrived.
 */
const withDeadline = async (pending: Promise<unknown>, reason: string) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out waiting for ${reason}`)),
      SIGNAL_DEADLINE,
    );
  });

  try {
    await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "group",
    datasetName,
    numGroups: 1,
    slices: [
      { name: "lidar_left", mediaType: "point-cloud" },
      { name: "lidar_right", mediaType: "point-cloud" },
    ],
    // the left lidar reaches world through a yawed ego frame, the right directly
    staticTransforms: [
      {
        source_frame: "lidar_left",
        target_frame: "ego",
        translation: [-8, 0, 0],
        quaternion: QUARTER_TURN,
      },
      { source_frame: "ego", target_frame: "world" },
      {
        source_frame: "lidar_right",
        target_frame: "world",
        translation: [8, 0, 0],
      },
    ],
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("renders both point-cloud slices aligned in the world frame", async ({
  eventUtils,
  fiftyoneLoader,
  grid,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName);
  await page.evaluate(() =>
    window.localStorage.setItem("fo-3d-annotation-tips-dismissed", "true"),
  );

  // each wait is armed before the action that causes the reveal, so no earlier
  // reveal can satisfy it
  const firstSliceRevealed = await eventUtils.arm(SCENE_REVEALED);
  await grid.openFirstSample();
  await modal.waitForSampleLoadDomAttribute(true);
  await withDeadline(firstSliceRevealed.received, "the scene to reveal");

  const bothSlicesRevealed = await eventUtils.arm(SCENE_REVEALED);
  await modal.toggleLooker3dSlice("lidar_right");
  await withDeadline(bothSlicesRevealed.received, "the second slice to reveal");

  // the reveal above means bounds are resolved and the camera is mounted, so
  // the top view frames both slices and its settle signal is dispatched
  await withDeadline(
    modal.looker3dControls.setTopView(),
    "the top view camera to settle",
  );
  await modal.looker3dControls.toggleGridHelper();

  await expect(modal.modalContainer).toHaveScreenshot(
    "world-aligned-slices.png",
    { mask: modal.looker3dScreenshotMasks, animations: "allow" },
  );
});
