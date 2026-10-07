/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * In Explore, a Segmentation or Heatmap frame field is one timeline row named
 * after the field, with a hole wherever a frame has no label. The Explore
 * timeline only plays back: no edit menu items and no resize handles.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("video-explore-mask-tracks");
const id = "000000000000000000000000";

// the default clip is 20 frames at 10 fps; frames 8-12 carry no labels
const FPS = 10;
const GAP = { first: 8, last: 12 };
const SEG = "field:frames.seg";
const HEAT = "field:frames.heat";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, datasetFactory }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.seg": "Segmentation",
      "frames.heat": "Heatmap",
    },
    withFrameData: ({ frameNumber }, { label, targetMask, valueMap }) =>
      frameNumber >= GAP.first && frameNumber <= GAP.last
        ? {}
        : {
            seg: label.segmentation({ mask: targetMask(64, 64, 1) }),
            heat: label.heatmap({ map: valueMap(64, 64, 0.5) }),
          },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test("mask fields are one read-only row each, with a hole at missing frames", async ({
  fiftyoneLoader,
  modal,
  page,
}) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.waitForSampleLoadDomAttribute();
  const va = modal.videoAnnotate;

  // dense label fields start inactive; the drawer toggle needs a row, and
  // rows only mount in an open drawer
  await va.afterTracksRendered([SEG], () =>
    modal.sidebar.toggleLabelCheckbox("frames.seg"),
  );
  await va.openTracksDrawer();
  await va.afterTracksRendered([SEG, HEAT], () =>
    modal.sidebar.toggleLabelCheckbox("frames.heat"),
  );
  expect((await va.objectTrackIds()).sort()).toEqual([HEAT, SEG]);

  await va.assert.trackLabel(SEG, "seg");
  await va.assert.trackLabel(HEAT, "heat");

  const bars = [
    { start: 0, end: (GAP.first - 1) / FPS },
    { start: GAP.last / FPS, end: 20 / FPS },
  ];
  expect(await va.trackIntervals(SEG)).toEqual(bars);
  expect(await va.trackIntervals(HEAT)).toEqual(bars);

  await va.assert.trackNotResizable(SEG);
  await va.assert.trackContextMenuItems(SEG, [
    "Move to start",
    "Move to end",
    "Shrink window to fit",
  ]);
});
