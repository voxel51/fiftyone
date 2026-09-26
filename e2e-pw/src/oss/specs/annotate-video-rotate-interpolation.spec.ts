/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Video keyframe interpolation of rotated bounding boxes (FOEPD-4586):
 * rotation lerps between keyframes along the SHORTEST arc — a 6.1 → 0.2 rad
 * pair (350° → 10°) sweeps ~20° through zero, never ~340° backwards.
 *
 * Flow: draw a box (frame 1 keyframe + auto-extend filler), set rotation 6.1
 * through the edit form, step to frame 11 and set 0.2 (promotes the frame to a
 * keyframe and re-lerps the segment), then read the interpolated rotation at
 * the midpoint frame back through the playhead-following edit form.
 */
import { test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix(
  "annotate-video-rotate-interp",
);
const id = "000000000000000000000000";

/** Keyframe rotations bracketing 0 rad: 350° and 10°. */
const LEFT_ROTATION = 6.1;
const RIGHT_ROTATION = 0.2;

// lerpRotation(LEFT_ROTATION, RIGHT_ROTATION, (frame - 1) / 10)
const SHORT_ARC: Record<number, string> = {
  3: "6.176637061435917",
  6: "0.00840734641020724",
  9: "0.12336293856408265",
};

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

test.beforeEach(async ({ datasetFactory }) => {
  // 40 frames @ 10fps — room for the keyframe pair and the auto-extend
  await datasetFactory.createDataset({
    mediaType: "video",
    datasetName,
    videoOptions: {
      duration: 4,
      width: 64,
      height: 64,
      frameRate: 10,
      color: "#3050a0",
    },
    sampleFrames: true,
    schema: {
      "frames.detections": "Detections",
      "frames.detections.detections.instance": "Instance",
      "frames.detections.detections.keyframe": "BooleanField",
      "frames.detections.detections.propagation": "DictField",
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
        ],
      },
    },
    // present-but-empty on every frame, so the first draw's patch can append
    withFrameData: (_, { label }) => ({ detections: label.detections([]) }),
  });
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

/** Draw a detection box (annotate mode) on the current frame. */
const drawBox = async (modal: ModalPom) => {
  await modal.sidebar.annotate.detectionMode("Detections");
  await modal.sampleCanvas.move(0.55, 0.55, "crosshair");
  await modal.sampleCanvas.down();
  await modal.sampleCanvas.move(0.78, 0.78);
  await modal.sampleCanvas.up();
};

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepForward();
  }
};

const stepBack = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepBack();
  }
};

/** Drop focus so the "." / "," frame-step keybindings aren't typed into an input. */
const blur = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test.describe.serial("video rotation interpolation", () => {
  test("rotation lerps the shortest arc between keyframes", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // keyframe A (frame 1): draw, then rotate via the form
    await drawBox(modal);
    await modal.sidebar.edit.setFieldValue(
      "rotation.rotation",
      `${LEFT_ROTATION}`,
    );
    await modal.sidebar.edit.assert.hasFieldValue(
      "rotation.rotation",
      `${LEFT_ROTATION}`,
    );

    // keyframe B (frame 11): a rotation edit on the auto-extended filler
    // promotes the frame to a keyframe and re-lerps the segment
    await blur(page);
    await stepForward(modal, 10);
    await modal.sidebar.edit.setFieldValue(
      "rotation.rotation",
      `${RIGHT_ROTATION}`,
    );
    await modal.sidebar.edit.assert.hasFieldValue(
      "rotation.rotation",
      `${RIGHT_ROTATION}`,
    );

    // 6.1 -> 0.2 crosses zero, so every in-between frame sits on the short arc
    // near 0; the long way around would put the midpoint near pi
    await blur(page);
    await stepBack(modal, 5); // frame 6
    await modal.sidebar.edit.assert.hasFieldValue(
      "rotation.rotation",
      SHORT_ARC[6],
    );

    await blur(page);
    await stepBack(modal, 3); // frame 3
    for (let frame = 3; frame <= 9; frame += 3) {
      await modal.sidebar.edit.assert.hasFieldValue(
        "rotation.rotation",
        SHORT_ARC[frame],
      );
      await blur(page);
      await stepForward(modal, 3);
    }
  });
});
