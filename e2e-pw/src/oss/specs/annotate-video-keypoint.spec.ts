/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a skeleton keypoint on the video-annotation surface. Keypoint
 * creation on video establishes a frame-field track (the `frames.` prefix
 * path), which image-surface coverage cannot reach:
 *   - guided placement works on the video canvas: clicks place nodes in
 *     skeleton order, Skip leaves a NaN hole,
 *   - the creation adds exactly one object track to the timeline,
 *   - the frame label survives a true server round-trip: a fresh browser
 *     context draws it on frame 1 and lists it with its placed nodes, and the
 *     skipped node comes back as a hole.
 */
import { type Browser, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
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

    const edit = modal.sidebar.edit;

    await modal.sidebar.annotate.keypointMode();
    await modal.sidebar.annotate.assert.keypointModeIsActive();
    await edit.assert.keypointNodeStatus(0, "target");

    // place node 0, skip node 1, place node 2. The establish on first
    // placement re-keys the draft into a track; the mode must survive it.
    await modal.sampleCanvas.placeKeypointNode(...PLACEMENTS[0]);
    await edit.assert.keypointNodeStatus(0, "placed");
    await edit.assert.keypointNodeStatus(1, "target");
    await modal.sidebar.annotate.assert.keypointModeIsActive();

    await edit.skipKeypointNode();
    await edit.assert.keypointNodeStatus(1, "skipped");
    await edit.assert.keypointNodeStatus(2, "target");
    await modal.sidebar.annotate.assert.keypointModeIsActive();

    await modal.sampleCanvas.placeKeypointNode(...PLACEMENTS[2]);
    await edit.assert.keypointNodeStatus(2, "placed");

    // the creation establishes exactly one object track on the timeline.
    await modal.videoAnnotate.assert.objectTrackCount(1);

    await edit.selectFieldChoice("label", "person");
    await edit.assert.verifyFieldValue("label", "person");
    await modal.sidebar.annotate.waitForSavesSettled();

    // true round-trip: a fresh browser context finds the track and the frame
    // label. The skip was session state, so node 1 reads back as the first
    // hole: the next placement target.
    await inFreshContext(browser, fiftyoneLoader, async (freshModal) => {
      await freshModal.videoAnnotate.assert.objectTrackCount(1);
      await freshModal.videoAnnotate.assert.labelListed("person");

      // frame 1 from a cold load: two dots, no edge through the hole
      await freshModal.videoAnnotate.assert.canvasRendersField(
        `frames.${FIELD}`,
      );
      await freshModal.sampleCanvas.assert.hasScreenshot(
        "keypoint-video-frame.png",
      );

      await freshModal.videoAnnotate.selectLabel("person");

      const freshEdit = freshModal.sidebar.edit;
      await freshEdit.assert.editsLabelType("Keypoint");
      await freshEdit.assert.keypointPlacedSummary(
        `2 of ${SKELETON_NODES.length} placed`,
      );
      await freshEdit.assert.keypointNodeStatus(0, "placed");
      await freshEdit.assert.keypointNodeStatus(1, "target");
      await freshEdit.assert.keypointNodeStatus(2, "placed");
    });
  });
});
