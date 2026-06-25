import { OssLoader } from "./loader";

export interface SeedVideoAnnotationOptions {
  /** Dataset name. */
  datasetName: string;
  /**
   * Absolute paths of the video media, one per sample. Sample `i` is created
   * with the fixed `_id` `ObjectId(f"{i:024x}")` so it can be deep-linked via
   * the `id` search param (sample 0 => "000000000000000000000000").
   */
  videoPaths: string[];
  /** Detection classes offered by the `detections` annotation schema. */
  classes?: string[];
  /** Temporal-detection classes offered by the `events` schema. */
  eventClasses?: string[];
  /** Seed the demo `events` TemporalDetections (approach/pass/depart). */
  withEvents?: boolean;
  /**
   * Sample indices that should carry a pre-seeded tracked frame detection
   * (a single instance, `index=1`, class `classes[0]`, on every frame) so
   * tests can exercise select/edit/track-fan-out/follow-anchor on an
   * existing track. Defaults to none (a clean slate, like `va-demo-bare`).
   */
  trackedSampleIndices?: number[];
  /**
   * Sample indices that should carry a SECOND tracked instance (`index=2`,
   * class `classes[1]`, on every frame) alongside the first — so tests can
   * exercise multi-track ops like merge. Additive; defaults to none.
   */
  secondTrackSampleIndices?: number[];
  /**
   * Subset of {@link trackedSampleIndices} whose tracked detection should also
   * carry an instance mask (a full `np.ones` mask) on every frame, so tests can
   * confirm detection masks render / decode on the video surface. Seeded via a
   * real `fo.Detection` so the mask encoder ships the decodable form.
   */
  maskedSampleIndices?: number[];
  /**
   * Sample indices that should carry a pre-seeded polyline track (a single
   * instance, `index=2`, class `classes[1]`, a closed triangle on every frame)
   * plus a declared `frames.polylines` field and an active polylines schema.
   * Defaults to none.
   */
  polylineSampleIndices?: number[];
  /**
   * Declare the `frames.polylines` field + activate its schema (and seed
   * empty-but-present polylines on every frame) WITHOUT pre-seeding any track.
   * Lets a clean-slate create test enter polyline mode and draw the first
   * polyline. Implied true whenever {@link polylineSampleIndices} is non-empty.
   */
  withPolylineField?: boolean;
}

/**
 * Seeds a video-annotation dataset: declared frame fields with an active
 * `frames.detections` annotation schema (keyed by its real frame path), an
 * active sample-level `events` TemporalDetections schema, materialized per-frame
 * images for the ImaVid tile, and empty-but-present `frames.detections` on every
 * frame so the first draw's JSON patch can append.
 */
export class VideoAnnotateSDK {
  loader: OssLoader;

  constructor() {
    this.loader = new OssLoader();
  }

  seed(options: SeedVideoAnnotationOptions) {
    const {
      datasetName,
      videoPaths,
      classes = ["vehicle", "person", "road sign"],
      eventClasses = ["approach", "pass", "depart"],
      withEvents = true,
      trackedSampleIndices = [],
      secondTrackSampleIndices = [],
      maskedSampleIndices = [],
      polylineSampleIndices = [],
      withPolylineField = false,
    } = options;

    const pyPaths = JSON.stringify(videoPaths);
    const pyClasses = JSON.stringify(classes);
    const pyEventClasses = JSON.stringify(eventClasses);
    const pyTracked = JSON.stringify(trackedSampleIndices);
    const pySecondTracked = JSON.stringify(secondTrackSampleIndices);
    const pyMasked = JSON.stringify(maskedSampleIndices);
    const pyPolyline = JSON.stringify(polylineSampleIndices);
    const pyWithPolylineField = withPolylineField ? "True" : "False";

    return this.loader.executePythonCode(`
import fiftyone as fo
import numpy as np
from bson import ObjectId

VIDEO_PATHS = ${pyPaths}
CLASSES = ${pyClasses}
EVENT_CLASSES = ${pyEventClasses}
WITH_EVENTS = ${withEvents ? "True" : "False"}
TRACKED = set(${pyTracked})
SECOND_TRACKED = set(${pySecondTracked})
MASKED = set(${pyMasked})
POLYLINE_TRACKED = set(${pyPolyline})
# Declare + activate the polylines field whenever a track is seeded OR a
# clean-slate polyline-create test asked for the schema only.
POLYLINE_SCHEMA = bool(POLYLINE_TRACKED) or ${pyWithPolylineField}
DETECTIONS_FIELD = "detections"
FRAME_DETECTIONS_PATH = "frames." + DETECTIONS_FIELD
POLYLINES_FIELD = "polylines"
FRAME_POLYLINES_PATH = "frames." + POLYLINES_FIELD
EVENTS_FIELD = "events"

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
dataset.media_type = "video"

# Fixed sample ids -> deep-linkable: sample i == ObjectId(f"{i:024x}").
# add_samples() regenerates ids, so force them via a raw insert of the
# sample docs (mirrors the image dataset factory's _make_dict trick).
samples = [
    fo.Sample(_id=ObjectId(f"{i:024x}"), filepath=p)
    for i, p in enumerate(VIDEO_PATHS)
]
dataset._sample_collection.insert_many(
    [dataset._make_dict(s, include_id=True) for s in samples]
)
dataset.reload()

# The surface requires populated VideoMetadata (frame_rate / total_frame_count
# / dimensions).
dataset.compute_metadata()

# (2) frame fields the propagation pipeline writes. Declare the parent
# Detections container first, then the nested specs.
dataset.add_frame_field(
    DETECTIONS_FIELD, fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
)
dataset.add_frame_field("detections.detections.keyframe", fo.BooleanField)
dataset.add_frame_field("detections.detections.propagation", fo.DictField)

# Per-frame Polylines container (declared when polyline tracks are seeded or a
# clean-slate create test asked for the polylines schema).
if POLYLINE_SCHEMA:
    dataset.add_frame_field(
        POLYLINES_FIELD,
        fo.EmbeddedDocumentField,
        embedded_doc_type=fo.Polylines,
    )
    dataset.add_frame_field("polylines.polylines.keyframe", fo.BooleanField)
    dataset.add_frame_field("polylines.polylines.propagation", fo.DictField)

# (4) sample-level TemporalDetections field.
dataset.add_sample_field(
    EVENTS_FIELD, fo.EmbeddedDocumentField, embedded_doc_type=fo.TemporalDetections
)


def total_frames(sample):
    n = (
        getattr(sample.metadata, "total_frame_count", None)
        if sample.metadata
        else None
    )
    if not n:
        n = max(sample.frames.keys()) if sample.frames else 0
    return int(n)


# Materialize per-frame images (ImaVid serves frames from these).
dataset.to_frames(sample_frames=True)

# Every frame gets an empty (present) Detections so the first draw can append.
for sample in dataset.iter_samples(progress=False, autosave=True):
    for fn in range(1, total_frames(sample) + 1):
        sample.frames[fn]["detections"] = fo.Detections(detections=[])

# Pre-seed a tracked detection on requested samples (one instance, index=1,
# class CLASSES[0], on every frame). Samples in MASKED also carry a full
# instance mask so detection-mask rendering can be exercised.
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx not in TRACKED:
        continue
    mask = np.ones((20, 20), dtype=bool) if idx in MASKED else None
    for fn in range(1, total_frames(sample) + 1):
        sample.frames[fn]["detections"] = fo.Detections(
            detections=[
                fo.Detection(
                    label=CLASSES[0],
                    bounding_box=[0.3, 0.3, 0.2, 0.2],
                    index=1,
                    mask=mask,
                )
            ]
        )

# A SECOND tracked instance (index=2, class CLASSES[1]) appended on every
# frame of requested samples — for multi-track ops (merge).
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx not in SECOND_TRACKED:
        continue
    for fn in range(1, total_frames(sample) + 1):
        dets = sample.frames[fn]["detections"]
        if dets is None:
            dets = fo.Detections(detections=[])
        dets.detections.append(
            fo.Detection(
                label=CLASSES[1],
                bounding_box=[0.55, 0.55, 0.2, 0.2],
                index=2,
            )
        )
        sample.frames[fn]["detections"] = dets

# Pre-seed a polyline track on requested samples (one instance, index=2,
# class CLASSES[1], a closed triangle on every frame). Every frame gets an
# empty (present) Polylines first so the seed and any later append line up.
if POLYLINE_SCHEMA:
    for idx, sample in enumerate(
        dataset.iter_samples(progress=False, autosave=True)
    ):
        for fn in range(1, total_frames(sample) + 1):
            sample.frames[fn]["polylines"] = fo.Polylines(polylines=[])
        if idx not in POLYLINE_TRACKED:
            continue
        for fn in range(1, total_frames(sample) + 1):
            sample.frames[fn]["polylines"] = fo.Polylines(
                polylines=[
                    fo.Polyline(
                        label=CLASSES[1],
                        points=[[[0.2, 0.2], [0.5, 0.2], [0.35, 0.5]]],
                        closed=True,
                        filled=False,
                        index=2,
                    )
                ]
            )

# (5) demo temporal events (approach / pass / depart thirds).
if WITH_EVENTS:
    for sample in dataset.iter_samples(progress=False, autosave=True):
        n = total_frames(sample)
        a = max(1, n // 3)
        b = max(a + 1, (2 * n) // 3)
        sample[EVENTS_FIELD] = fo.TemporalDetections(
            detections=[
                fo.TemporalDetection(label=EVENT_CLASSES[0], support=[1, a]),
                fo.TemporalDetection(label=EVENT_CLASSES[1], support=[a + 1, b]),
                fo.TemporalDetection(label=EVENT_CLASSES[2], support=[b + 1, n]),
            ]
        )

# (6) stable cross-frame Instance per (label, index) track, per sample —
# across both the detection and polyline lists.
for sample in dataset.iter_samples(progress=False, autosave=True):
    by_track = {}
    for frame in sample.frames.values():
        elements = []
        if frame.detections is not None:
            elements.extend(frame.detections.detections)
        if POLYLINE_TRACKED and frame.polylines is not None:
            elements.extend(frame.polylines.polylines)
        for label in elements:
            if label.index is None:
                continue
            key = (type(label).__name__, label.label, label.index)
            inst = by_track.get(key)
            if inst is None:
                inst = fo.Instance()
                by_track[key] = inst
            current = getattr(label, "instance", None)
            if current is None or current.id != inst.id:
                label.instance = inst

# Active annotation schemas: frames.detections + events.
det_schema = {
    "type": "detections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
        {"name": "tags", "type": "list<str>", "component": "text"},
        {"name": "confidence", "type": "float", "component": "text"},
        {"name": "index", "type": "int", "component": "text"},
        {"name": "mask_path", "type": "str", "component": "text"},
    ],
    "classes": CLASSES,
}
dataset.update_label_schema(
    FRAME_DETECTIONS_PATH, det_schema, allow_new_attrs=True
)
dataset.active_label_schemas = [FRAME_DETECTIONS_PATH]

# Active polylines schema (whenever the polylines field is declared).
if POLYLINE_SCHEMA:
    poly_schema = {
        "type": "polylines",
        "component": "dropdown",
        "attributes": [
            {"name": "id", "type": "id", "component": "text", "read_only": True},
            {"name": "index", "type": "int", "component": "text"},
        ],
        "classes": CLASSES,
    }
    dataset.update_label_schema(
        FRAME_POLYLINES_PATH, poly_schema, allow_new_attrs=True
    )
    dataset.active_label_schemas = dataset.active_label_schemas + [
        FRAME_POLYLINES_PATH
    ]

events_schema = {
    "type": "temporaldetections",
    "component": "dropdown",
    "attributes": [
        {"name": "id", "type": "id", "component": "text", "read_only": True},
    ],
    "classes": EVENT_CLASSES,
}
dataset.update_label_schema(EVENTS_FIELD, events_schema, allow_new_attrs=True)
dataset.active_label_schemas = dataset.active_label_schemas + [EVENTS_FIELD]

dataset.save()
print(
    "VIDEO_ANNOTATE_SEED_DONE",
    dataset.name,
    "samples=", len(dataset),
    "frames0=", total_frames(dataset.first()),
)
`);
  }
}
