/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Dynamic-attribute propagation on the video surface: an attribute declared
 * `dynamic` forward-fills from the edited frame instead of fanning across the
 * track, a later edit creates a boundary that an earlier edit fills up to
 * (sample-and-hold), and the fill is one undo step. Re-seeded per test with one
 * tracked `vehicle` carrying `turn_signal` = "off" on every frame.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-dynamic-attr",
);
const id = "000000000000000000000000";

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer }) => {
  await foWebServer.startWebServer();
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

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

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Await the autosave round-trip for the edited sample. */
const savedResponse = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

const ATTR = "turn_signal";

/** Step the playhead by `delta` frames (negative = backward), un-focused. */
const stepFrames = async (modal: ModalPom, page: Page, delta: number) => {
  await blur(page);
  const va = modal.videoAnnotate;

  for (let i = 0; i < Math.abs(delta); i++) {
    if (delta > 0) {
      await va.stepForward();
    } else {
      await va.stepBack();
    }
  }
};

/** Assert the selected track's `turn_signal` value at the current frame. */
const assertSignal = async (modal: ModalPom, expected: string) =>
  expect.poll(() => modal.sidebar.edit.getFieldValue(ATTR)).toBe(expected);

/** Commit a `turn_signal` choice at the current frame and await the save. */
const setSignal = async (modal: ModalPom, page: Page, choice: string) => {
  const saved = savedResponse(page);
  await modal.sidebar.edit.selectFieldChoice(ATTR, choice);
  await saved;
};

// re-seed per test: one tracked instance carrying turn_signal="off" everywhere.
// 20 frames @ 10fps — long enough to fill several frames forward.
test.beforeEach(async ({ datasetFactory }) => {
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
      [`frames.detections.detections.${ATTR}`]: "StringField",
    },
    labelSchemas: {
      "frames.detections": {
        type: "detections",
        component: "dropdown",
        classes: ["vehicle", "person", "road sign"],
        attributes: [
          { name: "id", type: "id", component: "text", read_only: true },
          { name: "tags", type: "list<str>", component: "text" },
          { name: "confidence", type: "float", component: "text" },
          { name: "index", type: "int", component: "text" },
          { name: "mask_path", type: "str", component: "text" },
          {
            name: ATTR,
            type: "str",
            component: "dropdown",
            values: ["off", "left", "right"],
            dynamic: true,
          },
        ],
      },
    },
    // one tracked vehicle on every frame, turn_signal "off" throughout
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
          [ATTR]: "off",
        }),
      ]),
    }),
  });
});

test.describe.serial("video annotation dynamic attribute", () => {
  test("an edit forward-fills to the track end, leaving earlier frames", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // select the seeded track; frame 1 reads the seeded "off"
    await modal.videoAnnotate.selectLabel("vehicle");
    await assertSignal(modal, "off");

    // edit at frame 4 -> "left"
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");
    await assertSignal(modal, "left");

    // earlier frame is untouched (forward-fill only)
    await stepFrames(modal, page, -1);
    await assertSignal(modal, "off");

    // a far-forward frame is filled — the value runs to the clip's end
    await stepFrames(modal, page, 10);
    await assertSignal(modal, "left");

    // the whole forward-fill is one undo unit: reverts every frame at once
    await modal.sidebar.edit.undo();
    await assertSignal(modal, "off");

    await stepFrames(modal, page, -9);
    await assertSignal(modal, "off");
  });

  test("a later change bounds a subsequent fill (sample-and-hold)", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    await modal.videoAnnotate.selectLabel("vehicle");

    // frame 4 -> "left" (left runs 4..end)
    await stepFrames(modal, page, 3);
    await setSignal(modal, page, "left");

    // frame 8 -> "right" (a change boundary: left 4..7, right 8..end)
    await stepFrames(modal, page, 4);
    await setSignal(modal, page, "right");

    // frame 6 -> "off": fills forward only up to the frame-8 boundary
    await stepFrames(modal, page, -2);
    await setSignal(modal, page, "off");
    await assertSignal(modal, "off");

    // frame 7 took the new value...
    await stepFrames(modal, page, 1);
    await assertSignal(modal, "off");

    // ...but frame 8 keeps "right" — the boundary was preserved
    await stepFrames(modal, page, 1);
    await assertSignal(modal, "right");

    // and frame 4 (before the edited frame) is still "left"
    await stepFrames(modal, page, -4);
    await assertSignal(modal, "left");
  });
});
