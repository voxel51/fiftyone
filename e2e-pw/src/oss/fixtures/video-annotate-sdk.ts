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
   * Optional string attribute declared `dynamic` in the `frames.detections`
   * schema (a dropdown over `values`) and seeded to `values[0]` on every frame
   * of the tracked detection — so tests can exercise dynamic-attribute
   * forward-fill propagation.
   */
  dynamicAttribute?: { name: string; values: string[] };
  /**
   * Multiple dynamic attributes (each a dropdown over its `values`, seeded to
   * `values[0]` on every frame of the tracked detection). Use when a test needs
   * more than one sub-track row. Takes precedence over {@link dynamicAttribute}.
   */
  dynamicAttributes?: Array<{ name: string; values: string[] }>;
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
      dynamicAttribute,
      dynamicAttributes,
    } = options;

    const pyPaths = JSON.stringify(videoPaths);
    const pyClasses = JSON.stringify(classes);
    const pyEventClasses = JSON.stringify(eventClasses);
    const pyTracked = JSON.stringify(trackedSampleIndices);
    // Normalize the singular + plural dynamic-attribute options into one list.
    const dynAttrs =
      dynamicAttributes ?? (dynamicAttribute ? [dynamicAttribute] : []);
    const pyDynAttrs = JSON.stringify(dynAttrs);

    return this.loader.executePythonCode(`
import fiftyone as fo
from bson import ObjectId

VIDEO_PATHS = ${pyPaths}
CLASSES = ${pyClasses}
EVENT_CLASSES = ${pyEventClasses}
WITH_EVENTS = ${withEvents ? "True" : "False"}
TRACKED = set(${pyTracked})
DYN_ATTRS = ${pyDynAttrs}
DETECTIONS_FIELD = "detections"
FRAME_DETECTIONS_PATH = "frames." + DETECTIONS_FIELD
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
for a in DYN_ATTRS:
    dataset.add_frame_field(
        "detections.detections." + a["name"], fo.StringField
    )

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
# class CLASSES[0], on every frame).
for idx, sample in enumerate(dataset.iter_samples(progress=False, autosave=True)):
    if idx not in TRACKED:
        continue
    dyn_kwargs = {a["name"]: a["values"][0] for a in DYN_ATTRS}
    for fn in range(1, total_frames(sample) + 1):
        sample.frames[fn]["detections"] = fo.Detections(
            detections=[
                fo.Detection(
                    label=CLASSES[0],
                    bounding_box=[0.3, 0.3, 0.2, 0.2],
                    index=1,
                    **dyn_kwargs,
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

# (6) stable cross-frame Instance per (label, index) track, per sample.
for sample in dataset.iter_samples(progress=False, autosave=True):
    by_track = {}
    for frame in sample.frames.values():
        dets = frame.detections
        if dets is None:
            continue
        for det in dets.detections:
            if det.index is None:
                continue
            key = (det.label, det.index)
            inst = by_track.get(key)
            if inst is None:
                inst = fo.Instance()
                by_track[key] = inst
            current = getattr(det, "instance", None)
            if current is None or current.id != inst.id:
                det.instance = inst

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
for a in DYN_ATTRS:
    det_schema["attributes"].append(
        {
            "name": a["name"],
            "type": "str",
            "component": "dropdown",
            "values": a["values"],
            "dynamic": True,
        }
    )
dataset.update_label_schema(
    FRAME_DETECTIONS_PATH, det_schema, allow_new_attrs=True
)
dataset.active_label_schemas = [FRAME_DETECTIONS_PATH]

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
