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
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
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

const expectNodeStatus = (
  modal: ModalPom,
  index: number,
  status: "placed" | "target" | "skipped" | "pending",
) =>
  expect(modal.sidebar.edit.keypointNodeRow(index)).toHaveAttribute(
    "data-cy-status",
    status,
  );

/** The node checklist's summary line, e.g. "2 of 4 placed". */
const expectPlacedSummary = (modal: ModalPom, summary: string) =>
  expect(modal.sidebar.edit.keypointPlacedSummary).toHaveText(summary);

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

test.beforeAll(
  async ({ annotateSDK, datasetFactory, fiftyoneLoader, foWebServer }) => {
    await foWebServer.startWebServer();
    // one sample per test (see README: prefer per-test samples over serial).
    await datasetFactory.createDataset({
      datasetName,
      numSamples: 2,
      imageOptions: { fillColor: "white", width: 640, height: 480 },
    });
    // The factory only models Detection(s)/Classification(s); declare both
    // Keypoints fields and their skeletons directly.
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
dataset.add_sample_field(
    "${FIELD}", fo.EmbeddedDocumentField, embedded_doc_type=fo.Keypoints
)
dataset.add_sample_field(
    "${ALT_FIELD}", fo.EmbeddedDocumentField, embedded_doc_type=fo.Keypoints
)
dataset.skeletons = {
    "${FIELD}": fo.KeypointSkeleton(
        labels=${JSON.stringify(SKELETON_NODES)},
        edges=[[0, 1], [0, 2], [1, 3], [2, 3]],
    ),
    "${ALT_FIELD}": fo.KeypointSkeleton(
        labels=${JSON.stringify(ALT_SKELETON_NODES)},
        edges=[[0, 1], [1, 2]],
    ),
}
dataset.save()
`);
    // Both fields share a class list so the dropdown offers the other one.
    for (const field of [FIELD, ALT_FIELD]) {
      await annotateSDK.updateLabelSchema(datasetName, field, {
        type: "keypoints",
        classes: ["person"],
        attributes: [],
        component: "dropdown",
      });
      await annotateSDK.addFieldToActiveLabelSchema(datasetName, field);
    }
  },
);

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe("keypoint field swap", () => {
  test("a fresh keypoint survives a field swap and undo restores its placements", async ({
    annotateSDK,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    const edit = modal.sidebar.edit;

    await test.step("arm keypoint placement on the 4-node field", async () => {
      await openAnnotate(fiftyoneLoader, modal, page, indexToId(0));
      await modal.sidebar.annotate.keypointMode();
      await modal.sidebar.annotate.assert.keypointModeIsActive();

      // The mode opens a draft in the last-used/default keypoints field; pin
      // it to FIELD so the placements below belong to the 4-node skeleton.
      if ((await edit.getCurrentField()) !== FIELD) {
        await edit.moveFieldTo(FIELD);
      }
      await expect.poll(() => edit.getCurrentField()).toBe(FIELD);
    });

    await test.step("place nodes 0 and 1", async () => {
      await expectNodeStatus(modal, 0, "target");
      await modal.sampleCanvas.click(...PLACEMENTS[0]);
      await expectNodeStatus(modal, 0, "placed");

      await modal.sampleCanvas.click(...PLACEMENTS[1]);
      await expectNodeStatus(modal, 1, "placed");

      await expectPlacedSummary(modal, "2 of 4 placed");
    });

    await test.step("move the label to the 3-node field", async () => {
      await edit.moveFieldTo(ALT_FIELD);
    });

    await test.step("the form stays open with the destination's empty checklist", async () => {
      await edit.assert.isOpen();
      await expect.poll(() => edit.getCurrentField()).toBe(ALT_FIELD);
      await expectPlacedSummary(modal, "0 of 3 placed");
    });

    await test.step("the session survives the autosave settle", async () => {
      await modal.sidebar.annotate.waitForSavesSettled();
      await edit.assert.isOpen();
    });

    await test.step("undo the move", async () => {
      await edit.assert.undoIsEnabled();
      await edit.undo();
    });

    await test.step("the source field and its placements come back", async () => {
      await edit.assert.isOpen();
      await expect.poll(() => edit.getCurrentField()).toBe(FIELD);
      await expectPlacedSummary(modal, "2 of 4 placed");
      await expectNodeStatus(modal, 0, "placed");
      await expectNodeStatus(modal, 1, "placed");
    });

    await test.step("the restored geometry persists", async () => {
      await modal.sidebar.annotate.waitForSavesSettled();

      // Placed nodes are finite; the two never-placed nodes stay NaN holes
      // ([null, null] over JSON).
      const state = await annotateSDK.getKeypointsState(datasetName, FIELD, {
        sampleIndex: 0,
      });
      expect(state.count).toBe(1);
      expect(state.points).toHaveLength(SKELETON_NODES.length);
      for (const index of [0, 1]) {
        expect(state.points[index][0]).toEqual(expect.any(Number));
        expect(state.points[index][1]).toEqual(expect.any(Number));
      }
      expect(state.points[2]).toEqual([null, null]);
      expect(state.points[3]).toEqual([null, null]);

      // the undone move leaves nothing behind at the destination.
      const alt = await annotateSDK.getKeypointsState(datasetName, ALT_FIELD, {
        sampleIndex: 0,
      });
      expect(alt.present).toBe(false);
    });
  });

  test("an existing keypoint survives a field swap and undo restores its placements", async ({
    annotateSDK,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    const edit = modal.sidebar.edit;

    await test.step("seed a fully placed keypoint", async () => {
      await annotateSDK.seedKeypoints(datasetName, FIELD, SEEDED_POINTS, {
        sampleIndex: 1,
      });
    });

    await test.step("open the seeded keypoint from the label list", async () => {
      await openAnnotate(fiftyoneLoader, modal, page, indexToId(1));
      await modal.sidebar.annotate.selectActiveLabel("person", 0);

      await edit.assert.isOpen();
      await expectPlacedSummary(modal, "4 of 4 placed");
      // an existing label opens PASSIVELY: placement is not armed.
      await modal.sidebar.annotate.assert.keypointModeIsActive(false);
    });

    await test.step("move the label to the 3-node field", async () => {
      await edit.moveFieldTo(ALT_FIELD);
    });

    await test.step("the form stays open with the destination's empty checklist", async () => {
      await edit.assert.isOpen();
      await expect.poll(() => edit.getCurrentField()).toBe(ALT_FIELD);
      await expectPlacedSummary(modal, "0 of 3 placed");
    });

    await test.step("the session survives the autosave settle", async () => {
      await modal.sidebar.annotate.waitForSavesSettled();
      await edit.assert.isOpen();
    });

    await test.step("undo the move", async () => {
      await edit.assert.undoIsEnabled();
      await edit.undo();
    });

    await test.step("the source field and its placements come back", async () => {
      await edit.assert.isOpen();
      await expect.poll(() => edit.getCurrentField()).toBe(FIELD);
      await expectPlacedSummary(modal, "4 of 4 placed");
      for (const index of SEEDED_POINTS.keys()) {
        await expectNodeStatus(modal, index, "placed");
      }
    });

    await test.step("the restored geometry persists", async () => {
      await modal.sidebar.annotate.waitForSavesSettled();

      // the undo restores the captured original, so every node reads back at
      // the coordinate it was seeded with.
      const state = await annotateSDK.getKeypointsState(datasetName, FIELD, {
        sampleIndex: 1,
      });
      expect(state.count).toBe(1);
      expect(state.points).toHaveLength(SEEDED_POINTS.length);
      for (const [index, [x, y]] of SEEDED_POINTS.entries()) {
        expect(state.points[index]).toEqual([
          expect.closeTo(x, 2),
          expect.closeTo(y, 2),
        ]);
      }

      const alt = await annotateSDK.getKeypointsState(datasetName, ALT_FIELD, {
        sampleIndex: 1,
      });
      expect(alt.present).toBe(false);
    });
  });
});
