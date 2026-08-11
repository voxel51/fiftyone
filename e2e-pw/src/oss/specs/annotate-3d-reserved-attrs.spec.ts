/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Regression coverage for FOEPD-4255: user attributes whose names collide
 * with UI bookkeeping (`type`, `color`, `isNew`, ...) on 3D labels. The old
 * working-store shape kept view state flat in the label document behind a
 * reserved-name strip list, so a schema attribute named `type` rendered in
 * the annotation form but its edits were silently stripped from every save.
 *
 * The spec seeds a cuboid whose schema declares `type` and `color` attributes
 * with initial values, then asserts the full round trip: the form renders the
 * persisted values, an edit persists to the DB verbatim, and no bookkeeping
 * keys leak into the stored document.
 */
import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-reserved");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const plyPath = `/tmp/${datasetName}.ply`;
const scenePath = `/tmp/${datasetName}.fo3d`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ foWebServer, mediaFactory }) => {
  await foWebServer.startWebServer();
  mediaFactory.createPly({ outputPath: plyPath, shape: "cube" });
  mediaFactory.createFo3d({ outputPath: scenePath, plyPath });
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("3d reserved-name attributes", () => {
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader, modal, page }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      classes: ["car", "truck"],
      cuboidSampleIndices: [0],
      detectionAttributes: [
        { name: "type", type: "str" },
        { name: "color", type: "str" },
      ],
      cuboidAttributeValues: { type: "sedan", color: "red" },
    });
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
    await modal.annotate3d.waitForSurface();
  });

  test("an attribute named `type` renders with its persisted value and an edit saves verbatim", async ({
    annotate3dSDK,
    modal,
    page,
  }) => {
    await modal.annotate3d.selectLabel("car");

    // the form renders the formerly-reserved attributes with their seeded
    // values — under the old strip list `type` was shadowed by bookkeeping
    await modal.sidebar.edit.assert.verifyFieldValue("type", "sedan");
    await modal.sidebar.edit.assert.verifyFieldValue("color", "red");

    // edit both attributes and let the change autosave
    const saved = page.waitForResponse(
      (r) =>
        /\/sample\//.test(r.url()) &&
        ["POST", "PATCH", "PUT"].includes(r.request().method()),
    );
    await modal.sidebar.edit.setFieldValue("type", "coupe");
    await modal.sidebar.edit.setFieldValue("color", "blue");
    await modal.sidebar.edit.assert.verifyFieldValue("type", "coupe");
    await modal.sidebar.edit.assert.verifyFieldValue("color", "blue");
    await saved;

    // the edits persist verbatim — the exact writes the strip list used to
    // silently drop (each readback spawns a python process, so give the DB
    // round-trip room for several attempts)
    await expect
      .poll(
        async () => {
          const doc = await annotate3dSDK.getCuboidDocument(datasetName);
          return doc ? { type: doc.type, color: doc.color } : null;
        },
        { timeout: 20_000 },
      )
      .toEqual({ type: "coupe", color: "blue" });

    // the label class and geometry survive the attribute write, and no
    // wrapper bookkeeping leaked into the persisted document
    const doc = await annotate3dSDK.getCuboidDocument(datasetName);
    expect(doc?.label).toBe("car");
    expect(doc?.location).toEqual([0, 0, 0]);
    expect(doc).not.toHaveProperty("path");
    expect(doc).not.toHaveProperty("sampleId");
    expect(doc).not.toHaveProperty("isNew");
    expect(doc).not.toHaveProperty("selected");
    expect(doc).not.toHaveProperty("ui");
  });
});
