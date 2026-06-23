/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Temporal-detection (TD) create / edit / delete on the video-annotation
 * surface, all engine-routed:
 *
 *  - create + edit: the "New TD" toolbar action mints a sample-level TD at the
 *    playhead; selecting it opens the editor and a class assigns through the
 *    engine and persists.
 *  - mid-list delete id-preservation (guards step-4 `idAlignedListDelta`):
 *    deleting the MIDDLE of three TDs must not renumber/rewrite the siblings.
 *    The sample-level list diff is id-aligned, so the surviving two keep their
 *    exact `_id`s and labels across a true round-trip (fresh browser context).
 *    The regression this guards rewrote a sibling's `_id` on a mid-list delete.
 *
 * Seeded with the three demo events (approach [1,6] / pass [7,13] /
 * depart [14,20] over a 20-frame clip), re-seeded per test for isolation.
 */
import { Browser, expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-td-crud");
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

/**
 * Engine-purity guard: deleting a TD must not write back to the engine from a
 * `lighter:overlay-removed` subscriber (the DispatchGuard throws "setActive was
 * called from within a subscriber"). Collect such violations to assert none.
 */
const collectEngineErrors = (page: Page): string[] => {
  const out: string[] = [];
  const keep = (t: string) => {
    if (/within a subscriber|setActive|DispatchGuard/.test(t)) out.push(t);
  };
  page.on("pageerror", (e) => keep(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") keep(m.text());
  });
  return out;
};

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  await mediaFactory.createVideo({
    outputPath: clip,
    duration: 2,
    width: 64,
    height: 64,
    frameRate: 10,
    color: "#3050a0",
  });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.beforeEach(async ({ videoAnnotateSDK }) => {
  // three TDs: approach [1,6], pass [7,13], depart [14,20].
  await videoAnnotateSDK.seed({ datasetName, videoPaths: [clip] });
});

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: Page
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.videoAnnotate.waitForSurface();
};

const savedResponse = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/sample\//.test(r.url()) &&
      ["POST", "PATCH", "PUT", "DELETE"].includes(r.request().method())
  );

const stepForward = async (modal: ModalPom, n: number) => {
  for (let i = 0; i < n; i++) {
    await modal.videoAnnotate.stepForward();
  }
};

test.describe.serial("video annotation temporal detection CRUD", () => {
  test("New TD creates a temporal detection, a class edit persists", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.temporalTrackCount(3);
    const before = new Set(await va.temporalTrackIds());

    // mint a TD at the playhead (frame 1 -> support [1, 11])
    await va.createTemporalDetection();
    await va.assert.temporalTrackCount(4);

    // find the new TD row and open its editor from the timeline
    const newTrack = (await va.temporalTrackIds()).find((t) => !before.has(t));
    expect(newTrack).toBeTruthy();

    const saved = savedResponse(page);
    await va.clickTrack(newTrack as string);
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.selectFieldChoice("label", "depart");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "depart");
    await saved;

    // the create + class survive a true round-trip
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      await m2.videoAnnotate.assert.temporalTrackCount(4);
    } finally {
      await context.close();
    }
  });

  test("deleting the middle TD preserves the siblings' ids and labels", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    const engineErrors = collectEngineErrors(page);
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.temporalTrackCount(3);
    const beforeIds = await va.temporalTrackIds();

    // step into the "pass" third [7,13] and target the middle TD
    await stepForward(modal, 7);
    await va.assert.labelListed("pass");
    const deletedId = await va.labelRowId("pass");
    const expectedIds = beforeIds.filter((t) => !t.endsWith(deletedId)).sort();
    expect(expectedIds).toHaveLength(2);

    // delete it through the editor (engine delete -> id-aligned list diff)
    const saved = savedResponse(page);
    await va.selectLabel("pass");
    await expect(modal.sidebar.edit.backButton).toBeVisible();
    await modal.sidebar.edit.deleteLabel();
    await saved;

    await va.assert.temporalTrackCount(2);
    expect((await va.temporalTrackIds()).sort()).toEqual(expectedIds);

    // deleting the open-in-editor TD must not write to the engine from the
    // `overlay-removed` subscriber (engine-purity DispatchGuard)
    expect(engineErrors).toEqual([]);

    // the round-trip is the real guard: the surviving two keep IDENTICAL ids
    // (a mid-list delete must not rewrite a sibling's _id) and their labels.
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      const va2 = m2.videoAnnotate;
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      await va2.assert.temporalTrackCount(2);
      expect((await va2.temporalTrackIds()).sort()).toEqual(expectedIds);

      // labels intact: approach at frame 1, depart in its third; no "pass"
      await va2.assert.labelListed("approach");
      await stepForward(m2, 13);
      await va2.assert.labelListed("depart");
      await va2.assert.labelListed("pass", false);
    } finally {
      await context.close();
    }
  });
});
