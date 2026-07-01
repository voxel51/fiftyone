/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Editing a temporal-detection (TD) `support` span from the timeline on the
 * video-annotation surface. Dragging a TD interval's resize handle writes the
 * new support through the engine; the timeline row must reflect the new span
 * immediately AND keep it after the autosave round-trip — it must not snap back
 * to the original span (guards the engine-derived TD timeline: the rows are
 * rebuilt from the engine's reactive TD set, not a scene-overlay signal that
 * only re-derived on overlay add/remove).
 *
 * Seeded with the three demo events (approach [1,6] / pass [7,13] /
 * depart [14,20] over a 20-frame clip @ 10fps), re-seeded per test.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import type { Page } from "src/oss/fixtures";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-video-td-edit");
const id = "000000000000000000000000";
const clip = `/tmp/${datasetName}.webm`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

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
  page: Page,
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
      ["POST", "PATCH", "PUT"].includes(r.request().method()),
  );

/** The TD timeline track whose tooltip names `label` (e.g. "approach"). */
const trackIdForLabel = async (
  va: ModalPom["videoAnnotate"],
  label: string,
): Promise<string> => {
  const ids = await va.temporalTrackIds();

  for (const trackId of ids) {
    if ((await va.trackBarTitle(trackId)).startsWith(label)) {
      return trackId;
    }
  }

  throw new Error(`no TD timeline track titled "${label}"`);
};

test.describe.serial("video annotation temporal detection edit", () => {
  test("dragging a TD interval end updates the timeline and does not snap back", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);
    const va = modal.videoAnnotate;

    await va.assert.temporalTrackCount(3);

    // "approach" is [1,6] -> rendered span 0.00-0.60s
    const approach = await trackIdForLabel(va, "approach");
    expect(await va.trackBarTitle(approach)).toContain("0.00-0.60s");

    // drag the end handle right; resolves to support end frame 7 -> 0.70s
    const saved = savedResponse(page);
    await va.dragTemporalIntervalEnd(approach, 40);

    // the timeline reflects the new span immediately (no snap back to 0.60s)
    await expect.poll(() => va.trackBarTitle(approach)).toContain("0.00-0.70s");

    // and it survives the autosave round-trip (no reconcile revert)
    await saved;
    await expect.poll(() => va.trackBarTitle(approach)).toContain("0.00-0.70s");

    // the real guard: the new support persists to a fresh browser context
    const context = await browser.newContext();
    const freshPage = await context.newPage();
    try {
      const m2 = new ModalPom(freshPage, new EventUtils(freshPage));
      await openAnnotate(fiftyoneLoader, m2, freshPage);
      const approach2 = await trackIdForLabel(m2.videoAnnotate, "approach");
      await expect
        .poll(() => m2.videoAnnotate.trackBarTitle(approach2))
        .toContain("0.00-0.70s");
    } finally {
      await context.close();
    }
  });
});
