/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a 2D skeleton keypoint on the image surface. First e2e coverage for
 * keypoint annotation:
 *   - activating keypoint mode opens a draft and guided placement walks the
 *     skeleton in order: each canvas click places the next node, Skip leaves a
 *     NaN hole and advances, and the checklist tracks per-node status,
 *   - the committed label persists across a true server round-trip, read back
 *     through the App in a fresh browser context: placed nodes as placed, the
 *     skipped node as an unplaced hole (the next target),
 *   - a point-scoped schema attribute edited in the node inspector reads back
 *     node by node after a reopen (the value-fill encoding's ODM guard lives
 *     in the Python unit tests),
 *   - an EXISTING keypoint opens passively (nothing armed), and the target
 *     row's Place button is its way into placement: once armed, the canvas
 *     click places the node instead of selecting the detection underneath it.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
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

/** Container-relative [0,1] placements, one per skeleton node. */
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

/** Reopen `sampleId` in a new browser context (nothing cached) and verify it. */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  sampleId: string,
  verify: (modal: ModalPom, page: Page) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id: sampleId }),
    });
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await freshModal.waitForSampleLoadDomAttribute();
    await freshModal.sidebar.switchMode("annotate");
    await freshModal.waitForLighterReady();
    await verify(freshModal, freshPage);
  } finally {
    await context.close();
  }
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

/** Open the modal in annotate mode, deep-linked to one sample. */
const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page,
  sampleId: string,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id: sampleId }),
  });
  await modal.waitForSampleLoadDomAttribute();
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.waitForLighterReady();
};

test.describe("2D annotation keypoint", () => {
  test("guided placement with a skip persists points and the NaN hole", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(0));
    await modal.sidebar.annotate.keypointMode();
    await modal.sidebar.annotate.assert.keypointModeIsActive();
    const { edit } = modal.sidebar;

    // the mode opens a draft; the checklist targets node 0.
    await edit.assert.keypointNodeStatus(0, "target");

    // guided placement walks the skeleton in order.
    await modal.sampleCanvas.placeKeypointNode(...PLACEMENTS[0]);
    await edit.assert.keypointNodeStatus(0, "placed");
    await edit.assert.keypointNodeStatus(1, "target");

    await modal.sampleCanvas.placeKeypointNode(...PLACEMENTS[1]);
    await edit.assert.keypointNodeStatus(1, "placed");
    await edit.assert.keypointNodeStatus(2, "target");

    // skipping leaves a hole and advances the target.
    await edit.skipKeypointNode();
    await edit.assert.keypointNodeStatus(2, "skipped");
    await edit.assert.keypointNodeStatus(3, "target");

    await modal.sampleCanvas.placeKeypointNode(...PLACEMENTS[3]);
    await edit.assert.keypointNodeStatus(3, "placed");
    await edit.assert.keypointPlacedSummary("3 of 4 placed · 1 skipped");

    // assigning a class commits through the edit form.
    await edit.selectFieldChoice("label", "person");
    await edit.assert.verifyFieldValue("label", "person");
    await modal.sidebar.annotate.waitForSavesSettled();

    // the render, deselected: three dots, the edges between placed nodes,
    // and nothing at the hole
    await edit.backButton.click();
    await edit.assert.isClosed();
    await modal.sampleCanvas.assert.hasScreenshot("keypoint-guided-skip.png");

    // true round-trip through the App's real read path (where holes arrive
    // as "nan" strings): placed nodes read back placed, and the hole reads
    // back as the next placement target (skips are session state).
    await inFreshContext(
      browser,
      fiftyoneLoader,
      indexToId(0),
      async (freshModal) => {
        const freshEdit = freshModal.sidebar.edit;
        await freshModal.sidebar.annotate.assert.hasActiveLabelsCount(1);
        // the same render as before the save, from a cold load
        await freshModal.sampleCanvas.assert.hasScreenshot(
          "keypoint-guided-skip.png",
        );
        await freshModal.sidebar.annotate.selectActiveLabel("person", 0);
        await freshEdit.assert.verifyFieldValue("label", "person");
        await freshEdit.assert.keypointNodeStatus(0, "placed");
        await freshEdit.assert.keypointNodeStatus(1, "placed");
        await freshEdit.assert.keypointNodeStatus(2, "target");
        await freshEdit.assert.keypointNodeStatus(3, "placed");
        await freshEdit.assert.keypointPlacedSummary("3 of 4 placed");
      },
    );
  });

  test("a point-scoped attribute reads back node by node", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(1));
    await modal.sidebar.annotate.keypointMode();
    await modal.sidebar.annotate.assert.keypointModeIsActive();
    const { edit } = modal.sidebar;

    // place the full skeleton.
    for (const [index, placement] of PLACEMENTS.entries()) {
      await modal.sampleCanvas.placeKeypointNode(...placement);
      await edit.assert.keypointNodeStatus(index, "placed");
    }
    // select node 1 and toggle its point-scoped bool in the inspector.
    await edit.keypointNodeRow(1).click();
    await expect(edit.keypointNodeInspector).toBeVisible();
    await edit.keypointPointAttributeToggle("occluded").click();
    await edit.assert.keypointPointAttributeChecked("occluded", true);
    // a class, so the reopened sample's label row is addressable by name
    await edit.selectFieldChoice("label", "person");
    await modal.sidebar.annotate.waitForSavesSettled();

    // after a reopen, only node 1 reads occluded: the stored list is the full
    // parallel list, one entry per node
    await inFreshContext(
      browser,
      fiftyoneLoader,
      indexToId(1),
      async (freshModal) => {
        const freshEdit = freshModal.sidebar.edit;
        await freshModal.sidebar.annotate.assert.hasActiveLabelsCount(1);
        await freshModal.sidebar.annotate.selectActiveLabel("person", 0);
        for (const index of [0, 1, 2, 3]) {
          await freshEdit.keypointNodeRow(index).click();
          await expect(freshEdit.keypointNodeInspector).toBeVisible();
          await freshEdit.assert.keypointPointAttributeChecked(
            "occluded",
            index === 1,
          );
        }
      },
    );
  });

  test("an existing keypoint arms placement from the target row's Place button", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // sample 2 carries the pre-existing keypoint and the box under it (seeded
    // at creation).
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(2));
    const { edit } = modal.sidebar;
    // the keypoint and the box
    await modal.sidebar.annotate.assert.hasActiveLabelsCount(2);
    await modal.sidebar.annotate.selectActiveLabel("person", 0);

    // an existing label opens PASSIVELY: node 0 is the target, but nothing is
    // armed, so the row offers Place (Skip alone would be a dead end).
    await modal.sidebar.annotate.assert.keypointModeIsActive(false);
    await edit.assert.keypointNodeStatus(0, "target");
    await expect(edit.keypointPlaceButton(0)).toBeVisible();
    await expect(edit.keypointSkipButton).toBeHidden();

    // Place arms the mode and force-targets the node; an ARMED target places
    // by canvas click, so Skip becomes the row's only button.
    await edit.placeKeypointNode(0);
    await modal.sidebar.annotate.assert.keypointModeIsActive(true);
    await expect(edit.keypointSkipButton).toBeVisible();
    await expect(edit.keypointPlaceButton(0)).toBeHidden();

    // the click places node 0 — it is NOT a Select click on the box under it,
    // which would swap the form to the detection.
    await modal.sampleCanvas.placeKeypointNode(0.5, 0.5);
    await edit.assert.keypointNodeStatus(0, "placed");
    await edit.assert.editsLabelType("Keypoint");
    await modal.sidebar.annotate.waitForSavesSettled();

    // after a reopen, node 0 reads placed and the rest stay unplaced
    await inFreshContext(
      browser,
      fiftyoneLoader,
      indexToId(2),
      async (freshModal) => {
        const freshEdit = freshModal.sidebar.edit;
        await freshModal.sidebar.annotate.assert.hasActiveLabelsCount(2);
        await freshModal.sidebar.annotate.selectActiveLabel("person", 0);
        await freshEdit.assert.keypointNodeStatus(0, "placed");
        await freshEdit.assert.keypointNodeStatus(1, "target");
        await freshEdit.assert.keypointNodeStatus(2, "pending");
        await freshEdit.assert.keypointNodeStatus(3, "pending");
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

    await modal.sampleCanvas.assert.hasScreenshot("keypoint-seeded-hole.png");
  });
});
