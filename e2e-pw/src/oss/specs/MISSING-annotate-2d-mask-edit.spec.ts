/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Editing an EXISTING 2D segmentation mask with the brush tool. The covered
 * mask specs only create-from-scratch and full-remove; this exercises the
 * incremental brush strokes on an already-painted mask:
 *   - an "Add" stroke that extends beyond the mask grows the pixel count and
 *     persists,
 *   - a "Remove" stroke erases pixels and is undoable on the engine stack.
 *
 * Mask state is read back from Python (`getDetectionsState`) — a true server
 * round-trip. The Add stroke grows the masked region beyond the seed bbox, so
 * the raw pixel count is a robust grow signal there. The Remove stroke is
 * asserted on COVERAGE FRACTION (`maskCoverage`), NOT raw pixels: the mask is
 * re-rasterized to the overlay's pixel resolution on commit (e.g. 50×50 →
 * ~124×165), so the raw count rises even when the painted area shrinks — only
 * the coverage fraction reflects the erase.
 *
 * SEED THE MASK VIA `fo.Detection`, not the factory JSON: the server's mask
 * encoder only converts an embedded numpy `mask` to the zlib-base64 the app
 * decodes when the label's `_cls` is a mask class (see MISSING-annotate-2d-mask).
 */
import { expect, test as base, type Page } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-2d-mask-edit");

/** Fixed ObjectId addressing the single sample (so we can deep-link the modal). */
const id = "000000000000000000000000";

const isSamplePatch = (method: string) =>
  ["POST", "PATCH", "PUT"].includes(method);

const savedSample = (page: Page) =>
  page.waitForResponse(
    (r) => /\/sample\//.test(r.url()) && isSamplePatch(r.request().method())
  );

/** A masked "cat" detection at a small bbox, mask fully set within the box. */
const seedMaskedDetection = () => `
import fiftyone as fo
import numpy as np

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
sample.detections = fo.Detections(detections=[
    fo.Detection(
        label="cat",
        bounding_box=[0.4, 0.4, 0.2, 0.2],
        mask=np.ones((50, 50), dtype=bool),
    )
])
sample.save()
`;

const test = base.extend<{ modal: ModalPom }>({
  modal: async ({ page, eventUtils }, use) => {
    await use(new ModalPom(page, eventUtils));
  },
});

test.beforeAll(async ({ annotateSDK, datasetFactory, foWebServer }) => {
  await foWebServer.startWebServer();
  await datasetFactory.createDataset({
    datasetName,
    imageOptions: { fillColor: "white", width: 640, height: 480 },
    schema: { detections: "Detections" },
  });
  await annotateSDK.updateLabelSchema(datasetName, "detections", {
    type: "detections",
    classes: ["cat", "dog"],
    attributes: [],
    component: "dropdown",
  });
  await annotateSDK.addFieldToActiveLabelSchema(datasetName, "detections");
});

test.afterAll(async ({ foWebServer }) => {
  await foWebServer.stopWebServer();
});

test.describe.serial("2D annotation mask edit (brush)", () => {
  test.beforeEach(async ({ fiftyoneLoader, modal, page }) => {
    // Re-seed a clean masked detection per test (serial, shared dataset).
    await fiftyoneLoader.executePythonCode(seedMaskedDetection());
    await fiftyoneLoader.waitUntilGridVisible(page, datasetName, {
      searchParams: new URLSearchParams({ id }),
    });
    await modal.waitForSampleLoadDomAttribute();
    await modal.assert.isOpen();
    await modal.sidebar.switchMode("annotate");
  });

  test("an Add brush stroke grows the mask and persists", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);

    const before = (
      await annotateSDK.getDetectionsState(datasetName, "detections")
    ).maskPixels;
    expect(before).toBeGreaterThan(0);

    await modal.sidebar.annotate.pickTool("Brush");
    await modal.sidebar.annotate.pickMaskMode("Add");

    // paint a stroke well outside the seeded bbox ([0.4,0.4]+0.2) so the mask
    // grows rather than re-covering already-set pixels.
    const saved = savedSample(page);
    await modal.sampleCanvas.drag(0.7, 0.5, 0.85, 0.5);
    await saved;

    await expect
      .poll(
        async () =>
          (
            await annotateSDK.getDetectionsState(datasetName, "detections")
          ).maskPixels
      )
      .toBeGreaterThan(before);
  });

  test("a Remove brush stroke erases pixels and is undoable", async ({
    annotateSDK,
    modal,
    page,
  }) => {
    await modal.sidebar.annotate.selectActiveLabel("cat", 0);
    await modal.sidebar.edit.assert.inSegmentationMode(true);

    // seed mask is fully set within its bbox → coverage starts at 1.0.
    const before = (
      await annotateSDK.getDetectionsState(datasetName, "detections")
    ).maskCoverage;
    expect(before).toBeGreaterThan(0);

    await modal.sidebar.annotate.pickTool("Brush");
    await modal.sidebar.annotate.pickMaskMode("Remove");

    // erase across the seeded bbox center.
    const saved = savedSample(page);
    await modal.sampleCanvas.drag(0.42, 0.5, 0.58, 0.5);
    await saved;

    // coverage drops — raw pixel count is unreliable across the commit's mask
    // re-rasterization, the covered FRACTION is not.
    await expect
      .poll(
        async () =>
          (
            await annotateSDK.getDetectionsState(datasetName, "detections")
          ).maskCoverage
      )
      .toBeLessThan(before);

    // the erase is one undoable engine unit — undo restores full coverage.
    await modal.sidebar.edit.assert.undoIsEnabled();
    const restored = savedSample(page);
    await modal.sidebar.edit.undo();
    await restored;

    await expect
      .poll(
        async () =>
          (
            await annotateSDK.getDetectionsState(datasetName, "detections")
          ).maskCoverage
      )
      .toBe(before);
  });
});
