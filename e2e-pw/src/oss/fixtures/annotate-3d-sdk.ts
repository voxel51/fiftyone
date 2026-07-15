import fs from "fs";
import os from "os";
import path from "path";

import { OssLoader } from "./loader";

export interface SeedAnnotate3dOptions {
  /** Dataset name. */
  datasetName: string;
  /**
   * Absolute paths of the `.fo3d` scene media, one per sample. Sample `i` is
   * created with the fixed `_id` `ObjectId(f"{i:024x}")` so it can be
   * deep-linked via the `id` search param (sample 0 => 24 zeros). The scene
   * files (and their referenced assets) must already exist on disk — write them
   * with `mediaFactory.createPly` + `mediaFactory.createFo3d` first.
   */
  scenePaths: string[];
  /** Detection (cuboid) classes offered by the `detections` annotation schema. */
  classes?: string[];
  /**
   * Sample indices that carry a pre-seeded 3D cuboid (a single
   * `fo.Detection` with `location`/`dimensions`/`rotation`, class
   * `classes[0]`) so tests can exercise select/edit/transform/delete on an
   * existing cuboid without the brittle three-click canvas draw. Defaults to
   * `[0]`.
   */
  cuboidSampleIndices?: number[];
  /**
   * Polyline (3D) classes. Passing this declares + activates a sample-level
   * `polylines` annotation schema (a `fo.Polylines` field). When omitted the
   * dataset has no polyline schema (the cuboid-only shape). The active
   * annotation schema becomes polylines-only unless cuboids are also requested
   * (a non-empty `cuboidSampleIndices`), so polyline-mode resolves the polyline
   * field by default.
   */
  polylineClasses?: string[];
  /**
   * Sample indices that carry a pre-seeded 3D polyline (a single `fo.Polyline`
   * with `points3d` — a list of segments of `[x,y,z]` — class
   * `polylineClasses[0]`) so tests can exercise select/edit/delete on an
   * existing polyline without the canvas draw. Only honored when
   * `polylineClasses` is set; defaults to `[0]` then.
   */
  polylineSampleIndices?: number[];
}

/**
 * Seeds a 3D-annotation dataset: `.fo3d` scene samples with fixed ids, a
 * declared + active sample-level `detections` annotation schema, and an
 * optional pre-seeded cuboid (`fo.Detection` with 3D geometry) on requested
 * samples. The sibling of {@link VideoAnnotateSDK} for the looker-3d surface.
 *
 * A 3D cuboid is a `fo.Detection` carrying `location` ([x,y,z] center),
 * `dimensions` ([l,w,h]) and `rotation` ([x,y,z] euler) — the same field the
 * `detection3dAdapter` renders on the annotation engine.
 */
export class Annotate3dSDK {
  loader: OssLoader;

  constructor() {
    this.loader = new OssLoader();
  }

  seed(options: SeedAnnotate3dOptions) {
    const {
      datasetName,
      scenePaths,
      classes = ["car", "truck", "pedestrian"],
      cuboidSampleIndices = [0],
      polylineClasses,
      polylineSampleIndices = [0],
    } = options;

    const seedPolylines = Array.isArray(polylineClasses);
    const pyPaths = JSON.stringify(scenePaths);
    const pyClasses = JSON.stringify(classes);
    const pyCuboids = JSON.stringify(cuboidSampleIndices);
    const pyPolylineClasses = JSON.stringify(polylineClasses ?? []);
    const pyPolylines = JSON.stringify(
      seedPolylines ? polylineSampleIndices : [],
    );
    const pySeedPolylines = seedPolylines ? "True" : "False";

    return this.loader.executePythonCode(`
import fiftyone as fo
from bson import ObjectId

SCENE_PATHS = ${pyPaths}
CLASSES = ${pyClasses}
CUBOIDS = set(${pyCuboids})
POLYLINE_CLASSES = ${pyPolylineClasses}
POLYLINES = set(${pyPolylines})
SEED_POLYLINES = ${pySeedPolylines}
DETECTIONS_FIELD = "detections"
POLYLINES_FIELD = "polylines"

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.media_type = "3d"

# Fixed sample ids -> deep-linkable: sample i == ObjectId(f"{i:024x}").
# add_samples() regenerates ids, so force them via a raw insert of the sample
# docs (mirrors the image dataset factory's _make_dict trick).
# media type is inferred from the .fo3d filepath (+ dataset.media_type); the
# raw doc insert rejects an explicit media_type kwarg on the Sample.
samples = [
    fo.Sample(_id=ObjectId(f"{i:024x}"), filepath=p)
    for i, p in enumerate(SCENE_PATHS)
]
dataset._sample_collection.insert_many(
    [dataset._make_dict(s, include_id=True) for s in samples]
)
dataset.reload()

# Declare the cuboid Detections container.
dataset.add_sample_field(
    DETECTIONS_FIELD,
    fo.EmbeddedDocumentField,
    embedded_doc_type=fo.Detections,
)

# Declare the polyline Polylines container when polyline classes are requested.
if SEED_POLYLINES:
    dataset.add_sample_field(
        POLYLINES_FIELD,
        fo.EmbeddedDocumentField,
        embedded_doc_type=fo.Polylines,
    )

# Pre-seed a cuboid (3D Detection) and/or a polyline (3D Polyline with
# points3d) on requested samples. A 3D polyline carries points3d (a list of
# [x,y,z] segments) as a dynamic attribute — points stays empty (it's the 2D
# field). The annotation engine renders the polyline off points3d.
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx in CUBOIDS:
        sample[DETECTIONS_FIELD] = fo.Detections(
            detections=[
                fo.Detection(
                    label=CLASSES[0],
                    location=[0.0, 0.0, 0.0],
                    dimensions=[2.0, 2.0, 2.0],
                    rotation=[0.0, 0.0, 0.0],
                )
            ]
        )
    else:
        sample[DETECTIONS_FIELD] = fo.Detections(detections=[])

    if not SEED_POLYLINES:
        continue

    if idx in POLYLINES:
        sample[POLYLINES_FIELD] = fo.Polylines(
            polylines=[
                fo.Polyline(
                    label=POLYLINE_CLASSES[0],
                    points=[],
                    points3d=[
                        [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0]]
                    ],
                    closed=False,
                    filled=False,
                )
            ]
        )
    else:
        sample[POLYLINES_FIELD] = fo.Polylines(polylines=[])

# Active annotation schema: sample-level detections (cuboids).
det_schema = {
    "type": "detections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
        {"name": "tags", "type": "list<str>", "component": "text"},
    ],
    "classes": CLASSES,
}
dataset.update_label_schema(DETECTIONS_FIELD, det_schema, allow_new_attrs=True)

active_schemas = []
# Keep detections active when a cuboid is requested OR when no polyline schema
# is present at all (the cuboid-only shape — preserves existing callers).
if CUBOIDS or not SEED_POLYLINES:
    active_schemas.append(DETECTIONS_FIELD)

if SEED_POLYLINES:
    poly_schema = {
        "type": "polylines",
        "component": "dropdown",
        "attributes": [
            {"name": "id", "type": "id", "component": "text", "read_only": True},
            {"name": "tags", "type": "list<str>", "component": "text"},
        ],
        "classes": POLYLINE_CLASSES,
    }
    dataset.update_label_schema(
        POLYLINES_FIELD, poly_schema, allow_new_attrs=True
    )
    active_schemas.append(POLYLINES_FIELD)
    # surface points3d/closed/filled (dynamic Polyline attrs) in the schema so
    # the modal sample query returns them and the seeded polyline renders.
    dataset.add_dynamic_sample_fields()

dataset.active_label_schemas = active_schemas or [DETECTIONS_FIELD]

dataset.save()
print(
    "ANNOTATE_3D_SEED_DONE",
    dataset.name,
    "samples=", len(dataset),
)
`);
  }

  /**
   * Reads back the persisted cuboid labels (the `label` of every `Detection`)
   * on a single sample's `detections` field. Use to verify a cuboid
   * create/edit/delete round-trip from the live DB without a fresh browser
   * context.
   *
   * @param dataset The dataset name
   * @param options.field The Detections field (default "detections")
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   */
  async getCuboidLabels(
    dataset: string,
    options: { field?: string; sampleIndex?: number } = {},
  ): Promise<string[]> {
    const field = options.field ?? "detections";
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `cuboid-labels-${dataset}-${field}-${sampleIndex}.json`,
    );

    await this.loader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${dataset}")
view = dataset.skip(${sampleIndex})
sample = view.first() if len(view) > 0 else None

labels = []
if sample is not None:
    try:
        field = sample.get_field("${field}")
    except Exception:
        field = None
    if field is not None and getattr(field, "detections", None):
        labels = [d.label for d in field.detections]

with open("${resultFile}", "w") as f:
    json.dump(labels, f)
`);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    return JSON.parse(raw) as string[];
  }

  /**
   * Reads back the persisted 3D geometry (`location` / `dimensions` /
   * `rotation`) of the first cuboid `Detection` on a sample. Use to verify a
   * geometry edit (e.g. a Position3d form change) round-trips to the DB.
   *
   * @param dataset The dataset name
   * @param options.field The Detections field (default "detections")
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   */
  async getCuboidGeometry(
    dataset: string,
    options: { field?: string; sampleIndex?: number } = {},
  ): Promise<{
    location: number[] | null;
    dimensions: number[] | null;
    rotation: number[] | null;
  }> {
    const field = options.field ?? "detections";
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `cuboid-geom-${dataset}-${field}-${sampleIndex}.json`,
    );

    await this.loader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${dataset}")
view = dataset.skip(${sampleIndex})
sample = view.first() if len(view) > 0 else None

result = {"location": None, "dimensions": None, "rotation": None}
if sample is not None:
    try:
        field = sample.get_field("${field}")
    except Exception:
        field = None
    if field is not None and getattr(field, "detections", None):
        det = field.detections[0]
        result["location"] = list(det.location) if det.location else None
        result["dimensions"] = list(det.dimensions) if det.dimensions else None
        result["rotation"] = list(det.rotation) if det.rotation else None

with open("${resultFile}", "w") as f:
    json.dump(result, f)
`);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    return JSON.parse(raw) as {
      location: number[] | null;
      dimensions: number[] | null;
      rotation: number[] | null;
    };
  }

  /**
   * Reads back the persisted polyline labels (the `label` of every
   * `fo.Polyline`) on a single sample's `polylines` field. The polyline
   * sibling of {@link getCuboidLabels}.
   *
   * @param dataset The dataset name
   * @param options.field The Polylines field (default "polylines")
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   */
  async getPolylineLabels(
    dataset: string,
    options: { field?: string; sampleIndex?: number } = {},
  ): Promise<string[]> {
    const field = options.field ?? "polylines";
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `polyline-labels-${dataset}-${field}-${sampleIndex}.json`,
    );

    await this.loader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${dataset}")
view = dataset.skip(${sampleIndex})
sample = view.first() if len(view) > 0 else None

labels = []
if sample is not None:
    try:
        field = sample.get_field("${field}")
    except Exception:
        field = None
    if field is not None and getattr(field, "polylines", None):
        labels = [p.label for p in field.polylines]

with open("${resultFile}", "w") as f:
    json.dump(labels, f)
`);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    return JSON.parse(raw) as string[];
  }

  /**
   * Reads back the persisted 3D geometry (`points3d` — a list of `[x,y,z]`
   * segments — plus `closed`/`filled`) of the first `fo.Polyline` on a sample.
   * Use to verify a polyline create/edit round-trips to the DB.
   *
   * @param dataset The dataset name
   * @param options.field The Polylines field (default "polylines")
   * @param options.sampleIndex Index into the dataset's sample order (default 0)
   */
  async getPolylineGeometry(
    dataset: string,
    options: { field?: string; sampleIndex?: number } = {},
  ): Promise<{
    points3d: number[][][] | null;
    closed: boolean | null;
    filled: boolean | null;
  }> {
    const field = options.field ?? "polylines";
    const sampleIndex = options.sampleIndex ?? 0;
    const resultFile = path.join(
      os.tmpdir(),
      `polyline-geom-${dataset}-${field}-${sampleIndex}.json`,
    );

    await this.loader.executePythonCode(`
import json
import fiftyone as fo

dataset = fo.load_dataset("${dataset}")
view = dataset.skip(${sampleIndex})
sample = view.first() if len(view) > 0 else None

result = {"points3d": None, "closed": None, "filled": None}
if sample is not None:
    try:
        field = sample.get_field("${field}")
    except Exception:
        field = None
    if field is not None and getattr(field, "polylines", None):
        poly = field.polylines[0]
        pts = poly.get_field("points3d") if poly.has_field("points3d") else None
        result["points3d"] = (
            [[list(pt) for pt in seg] for seg in pts] if pts else None
        )
        result["closed"] = bool(poly.closed)
        result["filled"] = bool(poly.filled)

with open("${resultFile}", "w") as f:
    json.dump(result, f)
`);

    const raw = fs.readFileSync(resultFile, "utf-8");
    fs.unlinkSync(resultFile);
    return JSON.parse(raw) as {
      points3d: number[][][] | null;
      closed: boolean | null;
      filled: boolean | null;
    };
  }
}
