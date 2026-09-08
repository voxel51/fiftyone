/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The annotation editor loads the sample from the current view, so a value a
 * `set_field` stage projects into the view (without materializing it to the DB)
 * becomes the diff baseline. When the annotator edits a cuboid, the autosave
 * PATCH must not write the stale, view-projected value of an unedited field
 * back to the DB.
 *
 * The dataset carries:
 *   - `note` (top-level StringField) materialized in the DB as "db-original"
 *   - one 3D cuboid (`fo.Detection`) the annotator will edit
 * A saved view applies `set_field("note", "projected-value")` so the modal
 * sample the editor loads sees `note == "projected-value"` (≠ the DB value).
 * After editing the cuboid's class + autosave, the DB `note` must still be
 * "db-original" — proving the projection was never persisted.
 */
import fs from "fs";
import os from "os";
import path from "path";

import { expect, test as base } from "src/oss/fixtures";
import { ModalPom } from "src/oss/poms/modal";
import { getUniqueDatasetNameWithPrefix } from "src/oss/utils";
import type { AbstractFiftyoneLoader } from "src/shared/abstract-loader";

const datasetName = getUniqueDatasetNameWithPrefix("annotate-3d-setfield");

/** Fixed ObjectId addressing the first sample (so we can deep-link the modal). */
const id = "000000000000000000000000";
const plyPath = `/tmp/${datasetName}.ply`;
const scenePath = `/tmp/${datasetName}.fo3d`;

/** Saved-view slug applying the `set_field` projection. */
const viewSlug = "set-field-note";

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

/**
 * Read back the DB-materialized `note` field on sample 0, loading the BASE
 * dataset (no view) so we observe the persisted value, not the projection.
 * Mirrors the fixture readback pattern (temp-file JSON), since the python
 * runner pipes stdout and does not return it.
 */
const readDbNote = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
): Promise<string | null> => {
  const resultFile = path.join(os.tmpdir(), `db-note-${datasetName}.json`);
  await fiftyoneLoader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
value = sample.get_field("note")
with open("${resultFile}", "w") as f:
    json.dump(value, f)
`);
  const raw = fs.readFileSync(resultFile, "utf-8");
  fs.unlinkSync(resultFile);
  return JSON.parse(raw) as string | null;
};

/**
 * Read back the DB-materialized `confidence` of the first cuboid on sample 0,
 * loading the BASE dataset (no view) so the projection is excluded.
 */
const readDbConfidence = async (
  fiftyoneLoader: AbstractFiftyoneLoader,
): Promise<number | null> => {
  const resultFile = path.join(os.tmpdir(), `db-conf-${datasetName}.json`);
  await fiftyoneLoader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${datasetName}")
sample = dataset.first()
field = sample.get_field("detections")
value = None
if field is not None and field.detections:
    value = field.detections[0].confidence
with open("${resultFile}", "w") as f:
    json.dump(value, f)
`);
  const raw = fs.readFileSync(resultFile, "utf-8");
  fs.unlinkSync(resultFile);
  return JSON.parse(raw) as number | null;
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
  test.beforeEach(async ({ annotate3dSDK, fiftyoneLoader }) => {
    await annotate3dSDK.seed({
      datasetName,
      scenePaths: [scenePath],
      classes: ["car", "truck", "pedestrian"],
      cuboidSampleIndices: [0],
    });

    // Materialize known DB values, then save a view that PROJECTS different
    // values onto them via set_field (non-materialized):
    //   - `note` (top-level scalar): "db-original" in DB, "DB-ORIGINAL" projected
    //   - `detections.detections.confidence` (a label attr ON the edited cuboid):
    //     0.10 in DB, 0.99 projected — rides the SAME label the user edits, so it
    //     is the strongest clobber vector for the field-level (SampleField) save.
    await fiftyoneLoader.executePythonCode(`
import fiftyone as fo
from fiftyone import ViewField as F

dataset = fo.load_dataset("${datasetName}")
dataset.add_sample_field("note", fo.StringField)
for sample in dataset.iter_samples(autosave=True, progress=False):
    sample["note"] = "db-original"
    field = sample.get_field("detections")
    if field is not None and field.detections:
        field.detections[0].confidence = 0.10
        sample.set_field("detections", field)
dataset.save()

view = (
    dataset
    .set_field("note", F("note").upper())  # -> "DB-ORIGINAL" projected
    .set_field("detections.detections.confidence", 0.99)  # projected onto label
)
dataset.save_view("${viewSlug}", view)
`);
  });

  test("editing a cuboid does not persist set_field-projected fields", async ({
    annotate3dSDK,
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

    // the cuboid edit persisted
    await expect
      .poll(async () => annotate3dSDK.getCuboidLabels(datasetName), {
        timeout: 20_000,
      })
      .toEqual(["truck"]);

    // CRITICAL: neither projected value may clobber the DB. The top-level
    // `note` projection must not persist...
    await expect
      .poll(async () => readDbNote(fiftyoneLoader), { timeout: 20_000 })
      .toBe("db-original");

    // ...and the projected `confidence` on the very label we edited must not
    // persist either (the field-level save path's clobber vector).
    await expect
      .poll(async () => readDbConfidence(fiftyoneLoader), { timeout: 20_000 })
      .toBe(0.1);
  });
});
