/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The annotation editor loads the sample from the current view, so a
 * `set_field` projection becomes the diff baseline, and an autosave after
 * editing a cuboid must not write projected values of unedited fields to the
 * DB. The dataset materializes `note` and the cuboid's `confidence` and saves
 * a view projecting different values over both.
 */
import { Browser, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import { EventUtils } from "src/shared/event-utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";
import { annotate3dSeed } from "./annotate-3d/seed";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-setfield");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

/** Saved-view slug applying the `set_field` projection. */
const viewSlug = "set-field-note";
// a stage-less saved view: the shared server session carries the projected
// view to every new page, so the fresh context must ask for the base explicitly
const baseSlug = "base";

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

/**
 * Open the modal on the BASE dataset (no view) in a brand-new browser context,
 * so what it renders is the persisted value, not the projection.
 */
const inFreshContext = async (
  browser: Browser,
  fiftyoneLoader: AbstractFiftyoneLoader,
  verify: (modal: ModalPom) => Promise<void>,
) => {
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  try {
    const freshModal = new ModalPom(freshPage, new EventUtils(freshPage));
    await fiftyoneLoader.waitUntilGridVisible(freshPage, datasetName, {
      searchParams: new URLSearchParams({ id, view: baseSlug }),
    });
    await freshModal.assert.isOpen();
    await verify(freshModal);
  } finally {
    await context.close();
  }
};

const openAnnotate = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
  modal: ModalPom,
  page: import("src/oss/fixtures").Page,
) => {
  await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
    searchParams: new URLSearchParams({ id, view: viewSlug }),
  });
  await modal.assert.isOpen();
  await modal.sidebar.switchMode("annotate");
  await modal.annotate3d.waitForSurface();
};

test.describe.serial("3d annotate set_field overwrite", () => {
  test.beforeEach(async ({ datasetFactory }) => {
    // Known DB values, plus a saved view that PROJECTS different values onto
    // them via set_field (non-materialized):
    //   - `note` (top-level scalar): "db-original" in DB, "DB-ORIGINAL" projected
    //   - `detections.detections.confidence` (a label attr ON the edited cuboid):
    //     0.10 in DB, 0.99 projected — rides the SAME label the user edits, so it
    //     is the strongest clobber vector for the field-level (SampleField) save.
    const seed = annotate3dSeed({
      classes: ["car", "truck", "pedestrian"],
      cuboidSampleIndices: [0],
      detectionAttributes: [{ name: "confidence", type: "float" }],
      cuboidAttributeValues: { confidence: 0.1 },
    });
    await datasetFactory.createDataset({
      mediaType: "3d",
      datasetName,
      ...seed,
      schema: { ...seed.schema, note: "StringField" },
      withSampleData: (scaffold, helpers) => ({
        ...seed.withSampleData(scaffold, helpers),
        note: "db-original",
      }),
      savedViews: {
        [baseSlug]: "dataset.view()",
        [viewSlug]:
          'dataset.set_field("note", F("note").upper()).set_field("detections.detections.confidence", 0.99)',
      },
    });
  });

  test("editing a cuboid does not persist set_field-projected fields", async ({
    browser,
    fiftyoneLoader,
    modal,
    page,
  }) => {
    await openAnnotate(fiftyoneLoader, modal, page);

    // sanity: the editor sees the PROJECTED note, not the DB value
    await modal.annotate3d.selectLabel("car");

    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.selectFieldChoice("label", "truck");
    await modal.sidebar.edit.assert.verifyFieldValue("label", "truck");
    await saved;

    // the cuboid edit persisted. CRITICAL: neither projected value may clobber
    // the DB — the base dataset still shows the materialized `note`, and the
    // projected `confidence` on the very label we edited must not persist
    // either (the field-level save path's clobber vector)
    await inFreshContext(browser, fiftyoneLoader, async (fresh) => {
      await fresh.sidebar.assert.verifySidebarEntryText("note", "db-original");
      await fresh.sidebar.switchMode("annotate");
      await fresh.annotate3d.waitForSurface();
      await fresh.annotate3d.assert.labelCount(1);
      await fresh.annotate3d.assert.labelListed("truck");
      await fresh.annotate3d.selectLabel("truck");
      await fresh.sidebar.edit.assert.verifyFieldValue("confidence", "0.1");
    });
  });
});
