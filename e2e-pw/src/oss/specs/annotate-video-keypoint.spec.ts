/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a skeleton keypoint on the video-annotation surface. Keypoint
 * creation on video establishes a frame-field track (the `frames.` prefix
 * path), which image-surface coverage cannot reach:
 *   - guided placement works on the video canvas: clicks place nodes in
 *     skeleton order, Skip leaves a NaN hole,
 *   - the creation adds exactly one object track to the timeline,
 *   - the frame label survives a true server round-trip: a fresh page draws
 *     it on frame 1 and lists it with its placed nodes, and the skipped node
 *     comes back as a hole.
 */
import { test as base, type Page } from "src/oss/fixtures";
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
  await modal.sidebar.annotate.afterLabelList(() =>
    modal.videoAnnotate.afterSurface(() =>
      modal.sidebar.switchMode("annotate"),
    ),
  );
};

/**
 * Verify persisted state on a fresh page (a true round-trip). The fixture
 * closes the test's page first, so call it last.
 */
const inFreshPage = async (
  openFreshPage: () => Promise<Page>,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const freshPage = await openFreshPage();
  const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
  await openAnnotate(fiftyoneLoader, freshModal, freshPage);
  await verify(freshModal);
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
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const { annotate, edit } = modal.sidebar;
    const { sampleCanvas, videoAnnotate } = modal;

    // clean slate: no object tracks yet
    await videoAnnotate.assert.objectTrackCount(0);

    await edit.afterKeypointChecklist(() => annotate.keypointMode());
    await annotate.assert.keypointModeIsActive();
    await edit.assert.keypointNodeStatuses(["target", "pending", "pending"]);

    // place node 0, skip node 1, place node 2. The establish on first
    // placement re-keys the draft into a track (exactly one new timeline
    // row); the mode must survive it.
    await videoAnnotate.afterTracksChange(() =>
      edit.afterKeypointChecklist(() => sampleCanvas.click(...PLACEMENTS[0])),
    );
    await videoAnnotate.assert.objectTrackCount(1);
    await edit.assert.keypointNodeStatuses(["placed", "target", "pending"]);
    await annotate.assert.keypointModeIsActive();

    await edit.afterKeypointChecklist(() => edit.skipKeypointNode());
    await edit.assert.keypointNodeStatuses(["placed", "skipped", "target"]);
    await annotate.assert.keypointModeIsActive();

    await edit.afterKeypointChecklist(() =>
      sampleCanvas.click(...PLACEMENTS[2]),
    );
    await edit.assert.keypointNodeStatuses(["placed", "skipped", "placed"]);

    await annotate.afterSave(() => edit.selectFieldChoice("label", "person"));
    await edit.assert.verifyFieldValue("label", "person");

    // true round-trip: a fresh page finds the track and the frame label. The
    // skip was session state, so node 1 reads back as the first hole: the
    // next placement target.
    await inFreshPage(openFreshPage, fiftyoneLoader, async (freshModal) => {
      const fresh = freshModal.sidebar;
      await freshModal.videoAnnotate.assert.objectTrackCount(1);
      await freshModal.videoAnnotate.assert.labelListed("person");

      // frame 1 from a cold load: two dots, no edge through the hole
      await freshModal.sampleCanvas.assert.hasMediaScreenshot(
        "keypoint-video-frame.png",
      );

      await fresh.edit.afterKeypointChecklist(() =>
        freshModal.videoAnnotate.selectLabel("person"),
      );
      await fresh.edit.assert.editsLabelType("Keypoint");
      await fresh.edit.assert.keypointPlacedSummary(
        `2 of ${SKELETON_NODES.length} placed`,
      );
      await fresh.edit.assert.keypointNodeStatuses([
        "placed",
        "target",
        "placed",
      ]);
    });
  });
});
