/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a skeleton keypoint on the video-annotation surface. Keypoint
 * creation on video establishes a frame-field track (the `frames.` prefix
 * path), which image-surface coverage cannot reach:
 *   - guided placement works on the video canvas: clicks place nodes in
 *     skeleton order, Skip leaves a NaN hole,
 *   - the creation adds exactly one object track to the timeline,
 *   - the frame label survives a true server round-trip: placed nodes as
 *     finite coordinates, the skipped node as a NaN hole on the frame.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { readKeypointsState } from "src/oss/utils/keypoints";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { indexToId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-keypoint");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = indexToId(0);

const FIELD = "keypoints";

/** The skeleton's node names, in placement order. */
const SKELETON_NODES = ["head", "hip", "foot"];

/** Container-relative [0,1] placements; node 1 is skipped. */
const PLACEMENTS: Array<[number, number]> = [
  [0.4, 0.3],
  [0.5, 0.5],
  [0.6, 0.7],
];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

const nodeRow = (page: Page, index: number) =>
  page.getByTestId(`keypoint-node-${index}`);

const expectNodeStatus = (
  page: Page,
  index: number,
  status: "placed" | "target" | "skipped" | "pending",
) => expect(nodeRow(page, index)).toHaveAttribute("data-cy-status", status);

/** Open the modal in annotate mode on the deep-linked video sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

/** Verify persisted state from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom, page: Page) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await openAnnotate(fiftyoneLoader, freshModal, freshPage);
    await verify(freshModal, freshPage);
  } finally {
    await context.close();
  }
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // clean slate (no pre-seeded tracks): the keypoint is the only track.
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: { [`frames.${FIELD}`]: "Keypoints" },
    // a skeleton is keyed by the BARE field name, even for a frame field.
    skeletons: {
      [FIELD]: {
        labels: SKELETON_NODES,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
    },
    labelSchemas: {
      [`frames.${FIELD}`]: {
        type: "keypoints",
        classes: ["person"],
        attributes: [],
        component: "dropdown",
      },
    },
    // present-but-empty on every frame, so the first placement's patch can append
    withFrameData: (_, { label }) => ({ [FIELD]: label.keypoints([]) }),
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("video keypoint creation", () => {
  test("guided placement creates a track and persists the frame label", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // clean slate: no object tracks yet.
    await modal.videoAnnotate.assert.objectTrackCount(0);

    await modal.sidebar.annotate.keypointMode();
    await modal.sidebar.annotate.assert.keypointModeIsActive();
    await expectNodeStatus(page, 0, "target");

    // place node 0, skip node 1, place node 2. The establish on first
    // placement re-keys the draft into a track; the mode must survive it.
    await modal.sampleCanvas.click(...PLACEMENTS[0]);
    await expectNodeStatus(page, 0, "placed");
    await expectNodeStatus(page, 1, "target");
    await modal.sidebar.annotate.assert.keypointModeIsActive();

    await page.getByTestId("keypoint-skip-node").click();
    await expectNodeStatus(page, 1, "skipped");
    await expectNodeStatus(page, 2, "target");
    await modal.sidebar.annotate.assert.keypointModeIsActive();

    await modal.sampleCanvas.click(...PLACEMENTS[2]);
    await expectNodeStatus(page, 2, "placed");

    // the creation establishes exactly one object track on the timeline.
    await modal.videoAnnotate.assert.objectTrackCount(1);

    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await modal.sidebar.annotate.waitForSavesSettled();

    // Python read-back from frame 1: placed nodes finite, the skipped node a
    // NaN hole ([null, null] over JSON).
    const state = await readKeypointsState(fiftyoneLoader, datasetName, FIELD, {
      frameNumber: 1,
    });
    expect(state.present).toBe(true);
    expect(state.count).toBe(1);
    expect(state.label).toBe("person");
    expect(state.points).toHaveLength(SKELETON_NODES.length);
    for (const index of [0, 2]) {
      expect(state.points[index][0]).toEqual(expect.any(Number));
      expect(state.points[index][1]).toEqual(expect.any(Number));
    }
    expect(state.points[1]).toEqual([null, null]);

    // true round-trip: the track survives a fresh browser context.
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(1);
    });
  });
});
