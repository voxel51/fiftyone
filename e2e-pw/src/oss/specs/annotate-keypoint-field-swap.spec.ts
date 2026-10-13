/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Moving a keypoint to another skeleton field from the edit form's field
 * dropdown (`Field.tsx`). A keypoint's move ERASES its geometry — a node index
 * is bound to its own skeleton's semantics, so the destination's nodes start as
 * holes — and the re-home plus the erase are ONE undo unit that restores the
 * source field and the original placements verbatim.
 *
 * The edit SESSION is meant to survive the swap in both directions: the form
 * stays open on the moved label showing the destination skeleton's empty
 * checklist, and it stays open through the autosave settle that follows (the
 * settle rebases the sample and remounts scene overlays, so surviving the
 * click alone is not enough). Covered for a keypoint freshly placed in this
 * session and for a pre-existing one opened passively from the label list.
 *
 * Two same-type `Keypoints` fields with DIFFERENT skeletons (4 nodes vs 3)
 * give the dropdown a destination whose node count the checklist must follow.
 */
import { test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import type { KeypointNodeStatus } from "src/oss/poms/modal/annotate-edit";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { LabelSchema } from "src/shared/dataset-factory";
import { EventUtils } from "src/shared/event-utils";
import { indexToId } from "src/shared/utils";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-keypoint-field-swap",
);

const FIELD = "keypoints";
const ALT_FIELD = "keypoints_alt";

/** `FIELD`'s skeleton node names, in placement order. */
const SKELETON_NODES = ["nose", "left-eye", "right-eye", "mouth"];

/** `ALT_FIELD`'s skeleton — a different topology, hence the erase. */
const ALT_SKELETON_NODES = ["head", "hip", "foot"];

/** Container-relative [0,1] placements for `FIELD`'s first two nodes. */
const PLACEMENTS: Array<[number, number]> = [
  [0.45, 0.3],
  [0.35, 0.42],
];

/** Relative coordinates of the pre-existing keypoint (every node placed). */
const SEEDED_POINTS: Array<[number, number]> = [
  [0.2, 0.2],
  [0.4, 0.2],
  [0.3, 0.4],
  [0.3, 0.6],
];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/** Open the modal on one sample and switch it to annotate. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
  sampleId: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: sampleId }),
    modalSample: "loaded",
  });
  await modal.assert.isOpen();
  await modal.sidebar.annotate.afterLabelList(() =>
    modal.afterLighterReady(() => modal.sidebar.switchMode("annotate")),
  );
};

/**
 * Reopen a sample on a fresh page (nothing cached) and check its one keypoint
 * through the App: it lives on `FIELD`, with these node statuses. The fixture
 * closes the test's page first, so call it last.
 */
const expectPersisted = async (
  openFreshPage: () => Promise<Page>,
  fiftyoneLoader: AbstractFiftyoneLoader,
  sampleId: string,
  statuses: KeypointNodeStatus[],
) => {
  const freshPage = await openFreshPage();
  const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
  await openAnnotate(fiftyoneLoader, freshModal, freshPage, sampleId);
  const fresh = freshModal.sidebar;
  // one label: the undone move left nothing behind at the destination
  await fresh.annotate.assert.hasActiveLabelsCount(1);
  await fresh.edit.afterKeypointChecklist(() =>
    fresh.annotate.selectActiveLabel("person", 0),
  );
  await fresh.edit.assert.currentField(FIELD);
  await fresh.edit.assert.keypointNodeStatuses(statuses);
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // one sample per test (see README: prefer per-test samples over serial).
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 2,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { [FIELD]: "Keypoints", [ALT_FIELD]: "Keypoints" },
    skeletons: {
      [FIELD]: {
        labels: SKELETON_NODES,
        edges: [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
        ],
      },
      [ALT_FIELD]: {
        labels: ALT_SKELETON_NODES,
        edges: [
          [0, 1],
          [1, 2],
        ],
      },
    },
    // Both fields share a class list so the dropdown offers the other one.
    labelSchemas: Object.fromEntries(
      [FIELD, ALT_FIELD].map((field): [string, LabelSchema] => [
        field,
        {
          type: "keypoints",
          classes: ["person"],
          attributes: [],
          component: "dropdown",
        },
      ]),
    ),
    // The second test opens a PRE-EXISTING, fully placed keypoint; sample 1
    // is its own, so seeding it at creation is invisible to the first test.
    withSampleData: ({ index }, { label }) =>
      index === 1
        ? {
            [FIELD]: label.keypoints([
              label.keypoint({ label: "person", points: SEEDED_POINTS }),
            ]),
          }
        : {},
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("keypoint field swap", () => {
  test("a fresh keypoint survives a field swap and undo restores its placements", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    const { annotate, edit } = modal.sidebar;

    await test.step("arm keypoint placement on the 4-node field", async () => {
      await openAnnotate(fiftyoneLoader, modal, page, indexToId(0));
      await edit.afterKeypointChecklist(() => annotate.keypointMode());
      await annotate.assert.keypointModeIsActive();

      // The mode opens a draft in the last-used/default keypoints field; pin
      // it to FIELD so the placements below belong to the 4-node skeleton.
      if ((await edit.getCurrentField()) !== FIELD) {
        await edit.afterKeypointChecklist(() => edit.moveFieldTo(FIELD));
      }
      await edit.assert.currentField(FIELD);
    });

    await test.step("place nodes 0 and 1", async () => {
      await edit.afterKeypointChecklist(() =>
        modal.sampleCanvas.click(...PLACEMENTS[0]),
      );
      await edit.afterKeypointChecklist(() =>
        modal.sampleCanvas.click(...PLACEMENTS[1]),
      );
      await edit.assert.keypointNodeStatuses([
        "placed",
        "placed",
        "target",
        "pending",
      ]);
      await edit.assert.keypointPlacedSummary("2 of 4 placed");
    });

    await test.step("move the label to the 3-node field", async () => {
      await annotate.afterSave(() =>
        edit.afterKeypointChecklist(() => edit.moveFieldTo(ALT_FIELD)),
      );
    });

    await test.step("the form stays open with the destination's empty checklist", async () => {
      await edit.assert.isOpen();
      await edit.assert.currentField(ALT_FIELD);
      await edit.assert.keypointPlacedSummary("0 of 3 placed");
    });

    await test.step("undo the move", async () => {
      await edit.assert.undoIsEnabled();
      await annotate.afterSave(() =>
        edit.afterKeypointChecklist(() => edit.undo()),
      );
    });

    await test.step("the source field and its placements come back", async () => {
      await edit.assert.isOpen();
      await edit.assert.currentField(FIELD);
      await edit.assert.keypointPlacedSummary("2 of 4 placed");
      await edit.assert.keypointNodeStatuses([
        "placed",
        "placed",
        "target",
        "pending",
      ]);
    });

    await test.step("the restored geometry persists", async () => {
      // placed nodes read back placed, the never-placed ones stay holes
      await expectPersisted(openFreshPage, fiftyoneLoader, indexToId(0), [
        "placed",
        "placed",
        "target",
        "pending",
      ]);
    });
  });

  test("an existing keypoint survives a field swap and undo restores its placements", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    const { annotate, edit } = modal.sidebar;

    await test.step("open the seeded keypoint from the label list", async () => {
      await openAnnotate(fiftyoneLoader, modal, page, indexToId(1));
      await modal.sampleCanvas.assert.hasMediaScreenshot(
        "keypoint-field-swap-seeded.png",
      );
      await edit.afterKeypointChecklist(() =>
        annotate.selectActiveLabel("person", 0),
      );

      await edit.assert.isOpen();
      await edit.assert.keypointPlacedSummary("4 of 4 placed");
      // an existing label opens PASSIVELY: placement is not armed
      await annotate.assert.keypointModeIsActive(false);
    });

    await test.step("move the label to the 3-node field", async () => {
      await annotate.afterSave(() =>
        edit.afterKeypointChecklist(() => edit.moveFieldTo(ALT_FIELD)),
      );
    });

    await test.step("the form stays open with the destination's empty checklist", async () => {
      await edit.assert.isOpen();
      await edit.assert.currentField(ALT_FIELD);
      await edit.assert.keypointPlacedSummary("0 of 3 placed");
    });

    await test.step("the erased destination draws nothing", async () => {
      // taken with the form still open: the undo below runs from it
      await modal.sampleCanvas.assert.hasMediaScreenshot(
        "keypoint-field-swap-destination.png",
      );
    });

    await test.step("undo the move", async () => {
      await edit.assert.undoIsEnabled();
      await annotate.afterSave(() =>
        edit.afterKeypointChecklist(() => edit.undo()),
      );
    });

    await test.step("the source field and its placements come back", async () => {
      await edit.assert.isOpen();
      await edit.assert.currentField(FIELD);
      await edit.assert.keypointPlacedSummary("4 of 4 placed");
      await edit.assert.keypointNodeStatuses([
        "placed",
        "placed",
        "placed",
        "placed",
      ]);
    });

    await test.step("the restored nodes draw where they were seeded", async () => {
      await annotate.afterEditing(() => edit.exitToList(), false);
      await modal.sampleCanvas.assert.hasMediaScreenshot(
        "keypoint-field-swap-seeded.png",
      );
    });

    await test.step("the restored geometry persists", async () => {
      await expectPersisted(openFreshPage, fiftyoneLoader, indexToId(1), [
        "placed",
        "placed",
        "placed",
        "placed",
      ]);
    });
  });
});
