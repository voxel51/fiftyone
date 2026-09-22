/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Creating a 2D skeleton keypoint on the image surface. First e2e coverage for
 * keypoint annotation:
 *   - activating keypoint mode opens a draft and guided placement walks the
 *     skeleton in order: each canvas click places the next node, Skip leaves a
 *     NaN hole and advances, and the checklist tracks per-node status,
 *   - the committed label persists across a true server round-trip (fresh
 *     browser context + Python read-back): placed nodes as finite coordinates,
 *     the skipped node as a NaN hole,
 *   - a point-scoped schema attribute edited in the node inspector persists as
 *     a VALUE-FILLED parallel list (false fillers, never null), and the list
 *     survives `add_dynamic_sample_fields()` — the ODM rejects null elements
 *     once the dataset field is declared, so this guards the value-fill
 *     encoding end to end,
 *   - an EXISTING keypoint opens passively (nothing armed), and the target
 *     row's Place button is its way into placement: once armed, the canvas
 *     click places the node instead of selecting the detection underneath it.
 */
import { Browser, expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { readKeypointsState } from "src/oss/utils/keypoints";
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

const nodeRow = (page: Page, index: number) =>
  page.getByTestId(`keypoint-node-${index}`);

const expectNodeStatus = (
  page: Page,
  index: number,
  status: "placed" | "target" | "skipped" | "pending",
) => expect(nodeRow(page, index)).toHaveAttribute("data-cy-status", status);

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
    numSamples: 3,
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
    withSampleData: ({ index }, { label }) =>
      index === 2
        ? {
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
          }
        : {},
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

    // the mode opens a draft; the checklist targets node 0.
    await expectNodeStatus(page, 0, "target");

    // guided placement walks the skeleton in order.
    await modal.sampleCanvas.click(...PLACEMENTS[0]);
    await expectNodeStatus(page, 0, "placed");
    await expectNodeStatus(page, 1, "target");

    await modal.sampleCanvas.click(...PLACEMENTS[1]);
    await expectNodeStatus(page, 1, "placed");
    await expectNodeStatus(page, 2, "target");

    // skipping leaves a hole and advances the target.
    await page.getByTestId("keypoint-skip-node").click();
    await expectNodeStatus(page, 2, "skipped");
    await expectNodeStatus(page, 3, "target");

    await modal.sampleCanvas.click(...PLACEMENTS[3]);
    await expectNodeStatus(page, 3, "placed");
    await expect(page.getByText("3 of 4 placed · 1 skipped")).toBeVisible();

    // assigning a class commits through the edit form.
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await modal.sidebar.annotate.waitForSavesSettled();

    // Python read-back: placed nodes are finite, the skipped node is a NaN
    // hole ([null, null] over JSON).
    const state = await readKeypointsState(fiftyoneLoader, datasetName, FIELD);
    expect(state.present).toBe(true);
    expect(state.count).toBe(1);
    expect(state.label).toBe("person");
    expect(state.points).toHaveLength(SKELETON_NODES.length);
    for (const index of [0, 1, 3]) {
      expect(state.points[index][0]).toEqual(expect.any(Number));
      expect(state.points[index][1]).toEqual(expect.any(Number));
    }
    expect(state.points[2]).toEqual([null, null]);

    // true round-trip: the hole reads back as the next placement target
    // (skips are session state; a fresh load sees an unplaced node).
    await inFreshContext(
      browser,
      fiftyoneLoader,
      indexToId(0),
      async (freshModal, freshPage) => {
        await expect
          .poll(() => freshModal.sidebar.annotate.getActiveLabelsCount())
          .toBe(1);
        await freshModal.sidebar.annotate.selectActiveLabel("person", 0);
        await expectNodeStatus(freshPage, 0, "placed");
        await expectNodeStatus(freshPage, 1, "placed");
        await expectNodeStatus(freshPage, 2, "target");
        await expectNodeStatus(freshPage, 3, "placed");
      },
    );
  });

  test("a point-scoped attribute persists as a value-filled list", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(1));
    await modal.sidebar.annotate.keypointMode();
    await modal.sidebar.annotate.assert.keypointModeIsActive();

    // place the full skeleton.
    for (const [index, placement] of PLACEMENTS.entries()) {
      await modal.sampleCanvas.click(...placement);
      await expectNodeStatus(page, index, "placed");
    }
    // select node 1 and toggle its point-scoped bool in the inspector.
    await nodeRow(page, 1).click();
    await expect(page.getByTestId("keypoint-node-inspector")).toBeVisible();
    await page.getByTestId("keypoint-occluded-toggle").click();
    await modal.sidebar.annotate.waitForSavesSettled();

    // the write is the FULL parallel list: false fillers, never null — the
    // ODM rejects null elements once the dataset field is declared.
    const state = await readKeypointsState(fiftyoneLoader, datasetName, FIELD, {
      sampleIndex: 1,
      attributes: ["occluded"],
    });
    expect(state.attributes.occluded).toEqual([false, true, false, false]);

    // regression guard: declaring the dynamic field turns on per-element ODM
    // validation, and a setattr round-trip re-validates the stored list. Null
    // fillers fail exactly here (2026-09 incident).
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
dataset.add_dynamic_sample_fields()
dataset.reload()
sample = dataset.skip(1).first()
kp = sample["${FIELD}"].keypoints[0]
kp.occluded = list(kp.occluded)
sample.save()
`);
    const declared = await readKeypointsState(
      fiftyoneLoader,
      datasetName,
      FIELD,
      { sampleIndex: 1, attributes: ["occluded"] },
    );
    expect(declared.attributes.occluded).toEqual([false, true, false, false]);
  });

  test("an existing keypoint arms placement from the target row's Place button", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // sample 2 carries the pre-existing keypoint and the box under it (seeded
    // at creation).
    await openAnnotate(fiftyoneLoader, modal, page, indexToId(2));
    // the keypoint and the box
    await expect
      .poll(() => modal.sidebar.annotate.getActiveLabelsCount())
      .toBe(2);
    await modal.sidebar.annotate.selectActiveLabel("person", 0);

    // an existing label opens PASSIVELY: node 0 is the target, but nothing is
    // armed, so the row offers Place (Skip alone would be a dead end).
    await modal.sidebar.annotate.assert.keypointModeIsActive(false);
    await expectNodeStatus(page, 0, "target");
    await expect(page.getByTestId("keypoint-place-node-0")).toBeVisible();
    await expect(page.getByTestId("keypoint-skip-node")).toBeHidden();

    // Place arms the mode and force-targets the node; an ARMED target places
    // by canvas click, so Skip becomes the row's only button.
    await modal.sidebar.edit.placeKeypointNode(0);
    await modal.sidebar.annotate.assert.keypointModeIsActive(true);
    await expect(page.getByTestId("keypoint-skip-node")).toBeVisible();
    await expect(page.getByTestId("keypoint-place-node-0")).toBeHidden();

    // the click places node 0 — it is NOT a Select click on the box under it,
    // which would swap the form to "Edit Detection".
    await modal.sampleCanvas.click(0.5, 0.5);
    await expectNodeStatus(page, 0, "placed");
    await expect(page.getByTestId("keypoint-node-list")).toBeVisible();
    await expect(page.getByText("Edit Detection")).toBeHidden();

    await modal.sidebar.annotate.waitForSavesSettled();
    const state = await readKeypointsState(fiftyoneLoader, datasetName, FIELD, {
      sampleIndex: 2,
    });
    expect(state.points[0][0]).toEqual(expect.any(Number));
    expect(state.points[0][1]).toEqual(expect.any(Number));
    for (const index of [1, 2, 3]) {
      expect(state.points[index]).toEqual([null, null]);
    }
  });
});
