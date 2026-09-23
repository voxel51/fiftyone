/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Editing an existing per-frame track on the video surface: a class edit fans
 * across every frame while geometry stays per-frame, the edit form follows the
 * playhead for the selected track, and canvas, timeline and sidebar drive one
 * shared selection. Re-seeded per test with one tracked `vehicle` at
 * `bounding_box=[0.3,0.3,0.2,0.2]` on every frame.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-track-edit");
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

/** Verify persisted state from a brand-new browser context (true round-trip). */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await openAnnotate(fiftyoneLoader, freshModal, freshPage);
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

/** Read a numeric edit-form field value (the sidebar shows relative [0,1]). */
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

// re-seed per test: one tracked instance (vehicle, index=1) on every frame.
// 20 frames @ 10fps — long enough to step several frames off the start.
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
    withFrameData: (_, { label }) => ({
      detections: label.detections([
        label.detection({
          label: "vehicle",
          bounding_box: [0.3, 0.3, 0.2, 0.2],
          index: 1,
          instance: label.instance("vehicle-1"),
        }),
      ]),
    }),
  });
});

test.describe.serial("video annotation track editing", () => {
  test("a class edit fans across the track, and a geometry edit re-keys it", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    // the seeded track is the only object track; it shows as "vehicle" on frame 1
    await va.assert.objectTrackCount(1);
    await va.assert.labelListed("vehicle");
    await va.selectLabel("vehicle");

    // a geometry edit on a non-keyframe makes it a keyframe
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.5");

    // track-level class edit — fans across every frame of the instance
    const saved = savedResponse(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "person");
    await saved;

    // step well off the edited frame and re-select the (now "person") track
    await modal.sidebar.edit.exitToList();
    for (let i = 0; i < 5; i++) {
      await va.stepForward();
    }

    // the class fanned out: frame 6 lists "person", not "vehicle"
    await va.assert.labelListed("person");
    await va.assert.labelListed("vehicle", false);

    // the seeded track has no keyframes, so frame 1 is now its only one and
    // frame 6 interpolates to it
    await va.selectLabel("person");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.5");
  });

  test("the edit form follows the selected track across frames", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.selectLabel("vehicle");

    // the edit makes frame 1 a keyframe, which the frames after it follow
    await modal.sidebar.edit.setFieldValue("position.x", "0.5");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.5");

    // step forward: the form follows the anchor to frame 2's detection rather
    // than closing. Blur first so "." steps the frame instead of typing into
    // the focused number input.
    await blur(page);
    await va.stepForward();
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.5");

    // key frame 2 apart from frame 1
    await modal.sidebar.edit.setFieldValue("position.x", "0.7");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.7");

    // step back: the form re-reads frame 1, which keeps its own edit
    await blur(page);
    await va.stepBack();
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.5");
  });

  test("geometry edits undo and redo through the engine stack", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // undo/redo are enabled on the video surface (engine value-based stack)
    await openAnnotate(fiftyoneLoader, modal, page);

    await modal.videoAnnotate.selectLabel("vehicle");
    const before = await modal.sidebar.edit.getFieldValue("position.x");
    await modal.sidebar.edit.assert.undoIsEnabled(false);

    // commit a geometry edit; undo becomes enabled
    await modal.sidebar.edit.setFieldValue("position.x", "0.1");
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.1");
    await modal.sidebar.edit.assert.undoIsEnabled();

    // undo reverts to the committed baseline; redo re-applies
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", before);

    await modal.sidebar.edit.redo();
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", "0.1");

    // restore baseline for any sibling
    await modal.sidebar.edit.undo();
    await modal.sidebar.edit.assert.verifyFieldValue("position.x", before);
  });

  test("selecting a track on the canvas neither persists nor promotes a keyframe", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    // A plain select-click can land in the box's resize hit-region, which set
    // the overlay's interaction state to RESIZE on pointer-down — so without a
    // movement gate the click finalized as a zero-delta resize, committing a
    // no-op edit and (on video) promoting the frame to a keyframe + persisting.
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);

    // count autosave round-trips from the moment we select
    let persists = 0;
    const countPersist = (r: {
      url(): string;
      request(): { method(): string };
    }) => {
      if (
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method())
      ) {
        persists += 1;
      }
    };
    page.on("response", countPersist);

    // select the track via the canvas overlay (hover until "pointer" registers)
    await modal.sampleCanvas.move(0.4, 0.4, "pointer");
    await modal.sampleCanvas.click(0.4, 0.4);

    // the editor opened — selection worked
    await expect(modal.sidebar.edit.backButton).toBeVisible();

    // a select is not an edit: the next autosave carries only a real edit. A
    // class change fans across the track without touching geometry, so a no-op
    // resize committed by the select would ride the same patch and promote the
    // frame to a keyframe — which the fresh load below would show
    const saved = savedResponse(page);
    await modal.sidebar.edit.selectFieldChoice("label", "person");
    await saved;
    expect(persists).toBe(1);
    page.off("response", countPersist);

    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      const va = fresh.videoAnnotate;
      await va.assert.labelListed("person");
      const [trackId] = await va.objectTrackIds();
      await va.openTracksDrawer();
      expect(await va.keyframeTimes(trackId)).toEqual([]);
    });
  });

  test("selecting on the canvas, timeline, and sidebar all open the same editor", async ({
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.objectTrackCount(1);
    const [trackId] = await va.objectTrackIds();

    // the tracks drawer starts closed; pin the row so the later timeline click
    // has a visible target
    await va.pinTrack(trackId);

    // sidebar row -> editor
    await va.selectLabel("vehicle");
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await modal.sidebar.edit.exitToList();

    // timeline row -> editor (same shared engine selection)
    await va.clickTrack(trackId);
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
    await modal.sidebar.edit.exitToList();

    // canvas overlay -> editor (the seeded box centers near 0.4,0.4 in relative
    // container coords; hover until the overlay's "pointer" cursor registers)
    await modal.sampleCanvas.move(0.4, 0.4, "pointer");
    await modal.sampleCanvas.click(0.4, 0.4);
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.assert.verifyFieldValue("label", "vehicle");
  });
});
