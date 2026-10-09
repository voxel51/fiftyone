/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a 2D skeleton keypoint on the image surface. First e2e coverage for
 * keypoint annotation:
 *   - activating keypoint mode opens a draft and guided placement walks the
 *     skeleton in order: each canvas click places the next node, Skip leaves a
 *     NaN hole and advances, and the checklist tracks per-node status,
 *   - the committed label persists across a true server round-trip, read back
 *     through the App on a fresh page: placed nodes as placed, the
 *     skipped node as an unplaced hole (the next target),
 *   - a point-scoped schema attribute edited in the node inspector reads back
 *     node by node after a reopen (the value-fill encoding's ODM guard lives
 *     in the Python unit tests),
 *   - an EXISTING keypoint opens passively (nothing armed), and the target
 *     row's Place button is its way into placement: once armed, the canvas
 *     click places the node instead of selecting the detection underneath it.
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import { indexToId } from "src/shared/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-keypoint");

const FIELD = "keypoints";

/**
 * A `Detections` field used only to park a box under a placement click, so a
 * click stolen by the box (the unarmed Select behavior) is observable.
 */
const BOX_FIELD = "boxes";

/** The skeleton's node names, in placement order. */
const SKELETON_NODES = ["nose", "left-eye", "right-eye", "mouth"];

/**
 * Container-relative [0,1] placements, one per skeleton node. The node names
 * are labels only: the full skeleton draws a diamond (nose top, eyes left and
 * right, mouth bottom), and a skipped node removes its corner and both edges.
 */
const PLACEMENTS: Array<[number, number]> = [
  [0.45, 0.3],
  [0.35, 0.42],
  [0.55, 0.42],
  [0.45, 0.6],
];

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/** Open `sampleId` in the modal and switch it to annotate. */
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
 * Reopen `sampleId` on a fresh page (nothing cached) and verify what the App
 * renders there. The fixture closes the test's page first, so call it last.
 */
const inFreshPage = async (
  openFreshPage: () => Promise<Page>,
  fiftyoneLoader: AbstractFiftyoneLoader,
  sampleId: string,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const freshPage = await openFreshPage();
  const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
  await openAnnotate(fiftyoneLoader, freshModal, freshPage, sampleId);
  await verify(freshModal);
};

test.beforeAll(async ({ datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  // one sample per test (see README: prefer per-test samples over serial).
  await datasetFactory.createDataset({
    datasetName,
    numSamples: 4,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { [FIELD]: "Keypoints", [BOX_FIELD]: "Detections" },
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
    },
    labelSchemas: {
      [FIELD]: {
        type: "keypoints",
        classes: ["person", "dog"],
        attributes: [
          {
            name: "occluded",
            type: "bool",
            component: "toggle",
            scope: "point",
          },
        ],
        component: "dropdown",
      },
      // Active so the seeded box RENDERS and is selectable in annotate mode —
      // otherwise "the click was not stolen by the box" proves nothing. Only
      // sample 2 carries a box, so the other tests' samples are unaffected.
      [BOX_FIELD]: {
        type: "detections",
        classes: ["box"],
        attributes: [],
        component: "dropdown",
      },
    },
    // Sample 2's test opens an EXISTING keypoint with nothing placed, over a
    // box parked under the canvas center: while the mode is unarmed a canvas
    // click is a plain Select click, so the box is exactly what a stolen
    // click would open.
    //
    // Sample 3 carries a seeded keypoint with one hole, for the render check.
    withSampleData: ({ index }, { label }) => {
      if (index === 2) {
        return {
          [FIELD]: label.keypoints([
            label.keypoint({
              label: "person",
              points: [null, null, null, null],
            }),
          ]),
          [BOX_FIELD]: label.detections([
            label.detection({
              label: "box",
              bounding_box: [0.25, 0.25, 0.5, 0.5],
            }),
          ]),
        };
      }

      if (index === 3) {
        return {
          [FIELD]: label.keypoints([
            label.keypoint({
              label: "person",
              points: [PLACEMENTS[0], PLACEMENTS[1], null, PLACEMENTS[3]],
            }),
          ]),
        };
      }

      return {};
    },
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("2D annotation keypoint", () => {
  test("guided placement with a skip persists points and the NaN hole", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(0));
    const { annotate, edit } = modal.sidebar;
    const { sampleCanvas } = modal;

    // the mode opens a draft; the checklist targets node 0
    await edit.afterKeypointChecklist(() => annotate.keypointMode());
    await annotate.assert.keypointModeIsActive();
    await edit.assert.keypointNodeStatuses([
      "target",
      "pending",
      "pending",
      "pending",
    ]);

    // guided placement walks the skeleton in order
    await edit.afterKeypointChecklist(() =>
      sampleCanvas.click(...PLACEMENTS[0]),
    );
    await edit.assert.keypointNodeStatuses([
      "placed",
      "target",
      "pending",
      "pending",
    ]);
    await edit.afterKeypointChecklist(() =>
      sampleCanvas.click(...PLACEMENTS[1]),
    );
    await edit.assert.keypointNodeStatuses([
      "placed",
      "placed",
      "target",
      "pending",
    ]);

    // skipping leaves a hole and advances the target
    await edit.afterKeypointChecklist(() => edit.skipKeypointNode());
    await edit.assert.keypointNodeStatuses([
      "placed",
      "placed",
      "skipped",
      "target",
    ]);

    // every placement writes the committed label, so the last one saves
    await annotate.afterSave(() =>
      edit.afterKeypointChecklist(() => sampleCanvas.click(...PLACEMENTS[3])),
    );
    await edit.assert.keypointNodeStatuses([
      "placed",
      "placed",
      "skipped",
      "placed",
    ]);
    await edit.assert.keypointPlacedSummary("3 of 4 placed · 1 skipped");

    // a new label starts with the field's first class (person), so the class
    // edit picks the other one: an unchanged class would save nothing
    await annotate.afterSave(() => edit.selectFieldChoice("label", "dog"));
    await edit.assert.verifyFieldValue("label", "dog");

    // the render, deselected: the diamond without its right-eye corner. Three
    // dots, two edges, and nothing at the hole.
    await annotate.afterEditing(() => edit.exitToList(), false);
    await sampleCanvas.assert.hasMediaScreenshot("keypoint-guided-skip.png");

    // true round-trip through the App's real read path (where holes arrive
    // as "nan" strings): the same render from a cold load, placed nodes read
    // back placed, and the hole reads back as the next placement target
    // (skips are session state)
    await inFreshPage(
      openFreshPage,
      fiftyoneLoader,
      indexToId(0),
      async (freshModal) => {
        const fresh = freshModal.sidebar;
        await fresh.annotate.assert.hasActiveLabelsCount(1);
        await freshModal.sampleCanvas.assert.hasMediaScreenshot(
          "keypoint-guided-skip.png",
        );
        await fresh.edit.afterKeypointChecklist(() =>
          fresh.annotate.selectActiveLabel("dog", 0),
        );
        await fresh.edit.assert.verifyFieldValue("label", "dog");
        await fresh.edit.assert.keypointNodeStatuses([
          "placed",
          "placed",
          "target",
          "placed",
        ]);
        await fresh.edit.assert.keypointPlacedSummary("3 of 4 placed");
      },
    );
  });

  test("a point-scoped attribute reads back node by node", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(1));
    const { annotate, edit } = modal.sidebar;

    // place the full skeleton
    await edit.afterKeypointChecklist(() => annotate.keypointMode());
    for (const placement of PLACEMENTS) {
      await edit.afterKeypointChecklist(() =>
        modal.sampleCanvas.click(...placement),
      );
    }
    await edit.assert.keypointNodeStatuses([
      "placed",
      "placed",
      "placed",
      "placed",
    ]);

    // select node 1 and toggle its point-scoped bool in the inspector
    await edit.afterKeypointChecklist(() => edit.keypointNodeRow(1).click());
    await annotate.afterSave(() =>
      edit.keypointPointAttributeToggle("occluded").click(),
    );
    await edit.assert.keypointPointAttributeChecked("occluded", true);
    // the label already carries the field's first class (person), which
    // addresses its row after the reopen

    // after a reopen, only node 1 reads occluded: the stored list is the full
    // parallel list, one entry per node
    await inFreshPage(
      openFreshPage,
      fiftyoneLoader,
      indexToId(1),
      async (freshModal) => {
        const fresh = freshModal.sidebar;
        await fresh.annotate.assert.hasActiveLabelsCount(1);
        await fresh.edit.afterKeypointChecklist(() =>
          fresh.annotate.selectActiveLabel("person", 0),
        );
        for (const index of [0, 1, 2, 3]) {
          await fresh.edit.afterKeypointChecklist(() =>
            fresh.edit.keypointNodeRow(index).click(),
          );
          await fresh.edit.assert.keypointPointAttributeChecked(
            "occluded",
            index === 1,
          );
        }
      },
    );
  });

  test("an existing keypoint arms placement from the target row's Place button", async ({
    fiftyoneLoader,
    modal,
    openFreshPage,
    page,
  }) => {
    // sample 2 carries the pre-existing keypoint and the box under it (seeded
    // at creation)
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(2));
    const { annotate, edit } = modal.sidebar;
    // the keypoint and the box
    await annotate.assert.hasActiveLabelsCount(2);
    await edit.afterKeypointChecklist(() =>
      annotate.selectActiveLabel("person", 0),
    );

    // an existing label opens PASSIVELY: node 0 is the target, but nothing is
    // armed, so the row offers Place (Skip alone would be a dead end)
    await annotate.assert.keypointModeIsActive(false);
    await edit.assert.keypointNodeStatuses([
      "target",
      "pending",
      "pending",
      "pending",
    ]);
    expect(await edit.keypointPlaceButton(0).isVisible()).toBe(true);
    expect(await edit.keypointSkipButton.isVisible()).toBe(false);

    // Place arms the mode and force-targets the node; an ARMED target places
    // by canvas click, so Skip becomes the row's only button
    await edit.afterKeypointChecklist(() => edit.placeKeypointNode(0));
    await annotate.assert.keypointModeIsActive(true);
    expect(await edit.keypointSkipButton.isVisible()).toBe(true);
    expect(await edit.keypointPlaceButton(0).isVisible()).toBe(false);

    // the click places node 0. It is NOT a Select click on the box under it,
    // which would swap the form to the detection.
    await annotate.afterSave(() =>
      edit.afterKeypointChecklist(() => modal.sampleCanvas.click(0.5, 0.5)),
    );
    await edit.assert.keypointNodeStatuses([
      "placed",
      "target",
      "pending",
      "pending",
    ]);
    await edit.assert.editsLabelType("Keypoint");

    // after a reopen, node 0 reads placed and the rest stay unplaced
    await inFreshPage(
      openFreshPage,
      fiftyoneLoader,
      indexToId(2),
      async (freshModal) => {
        const fresh = freshModal.sidebar;
        await fresh.annotate.assert.hasActiveLabelsCount(2);
        await fresh.edit.afterKeypointChecklist(() =>
          fresh.annotate.selectActiveLabel("person", 0),
        );
        await fresh.edit.assert.keypointNodeStatuses([
          "placed",
          "target",
          "pending",
          "pending",
        ]);
      },
    );
  });

  test("a seeded keypoint renders its placed nodes and leaves the hole empty", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // sample 3 was seeded through the factory with a null (NaN) hole at
    // node 2: the stored hole must not draw a dot or its edges
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(3));
    await modal.sidebar.annotate.assert.hasActiveLabelsCount(1);

    await modal.sampleCanvas.assert.hasMediaScreenshot(
      "keypoint-seeded-hole.png",
    );
  });
});
