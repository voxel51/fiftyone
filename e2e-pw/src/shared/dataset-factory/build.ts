/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OssLoader } from "src/oss/fixtures/loader";
import { writeToTmpFile } from "src/oss/utils/fs";
import { mediaDir } from "./media";
import type {
  BaseDatasetOptions,
  EmbeddedDocType,
  FieldType,
  FrameSpec,
  GroupSliceConfig,
  OrthographicProjections,
  SampleSpec,
} from "./types";

/**
 * The field type strings that are embedded document types, FiftyOne labels
 * and `DynamicEmbeddedDocument`. Used by {@link isEmbeddedDocType} to tell
 * them from scalar fields.
 */
const EMBEDDED_DOC_TYPES = new Set([
  "DynamicEmbeddedDocument",
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Heatmap",
  "Instance",
  "Polyline",
  "Polylines",
  "Segmentation",
  "TemporalDetection",
  "TemporalDetections",
]);

/**
 * Type guard for the {@link EmbeddedDocType} types.
 *
 * @example
 * isEmbeddedDocType("Detection")  // true
 * isEmbeddedDocType("FloatField") // false
 */
function isEmbeddedDocType(fieldType: string): fieldType is EmbeddedDocType {
  return EMBEDDED_DOC_TYPES.has(fieldType);
}

export interface BuildOptions extends Pick<
  BaseDatasetOptions,
  | "appConfig"
  | "datasetName"
  | "indexes"
  | "labelSchemas"
  | "promptableIndexes"
  | "savedViews"
  | "schema"
  | "staticTransforms"
> {
  mediaType: "image" | "video" | "3d" | "point-cloud" | "multimodal" | "group";
  samples: SampleSpec[];
  frames?: FrameSpec[];
  sampleFrames?: boolean;
  groupSlices?: GroupSliceConfig[];
  orthographicProjections?: OrthographicProjections;
  visualizations?: BuildVisualization[];
  /** Named workspaces, each a Python expression building an `fo.Space` */
  workspaces?: { [name: string]: string };
}

/** A visualization run, with points keyed by sample id */
export interface BuildVisualization {
  brainKey: string;
  /** Embed this label-list field's labels; null embeds samples */
  patchesField: string | null;
  /** Embed only this group slice's samples; null embeds the dataset */
  slice: string | null;
  /** One point per sample, or one per label (in label order) */
  points: { [sampleId: string]: number[] | number[][] };
}

/**
 * `ListField<ListField<FloatField>>` → `fo.ListField(fo.ListField(fo.FloatField()))`;
 * an embedded document type → `fo.EmbeddedDocumentField(fo.<type>)`.
 */
const fieldInstance = (fieldType: string): string => {
  const list = /^ListField<(.*)>$/.exec(fieldType);
  if (list) {
    return `fo.ListField(${fieldInstance(list[1])})`;
  }
  return isEmbeddedDocType(fieldType)
    ? `fo.EmbeddedDocumentField(fo.${fieldType})`
    : `fo.${fieldType}()`;
};

const addField = (fieldPath: string, fieldType: FieldType) => {
  const isFrameField = fieldPath.startsWith("frames.");
  const method = isFrameField ? "add_frame_field" : "add_sample_field";
  const name = isFrameField ? fieldPath.slice("frames.".length) : fieldPath;
  if (isEmbeddedDocType(fieldType)) {
    return `dataset.${method}("${name}", fo.EmbeddedDocumentField, embedded_doc_type=fo.${fieldType})`;
  }
  const list = /^ListField<(.*)>$/.exec(fieldType);
  return list
    ? `dataset.${method}("${name}", fo.ListField, subfield=${fieldInstance(list[1])})`
    : `dataset.${method}("${name}", fo.${fieldType})`;
};

/**
 * Builds a dataset from generated media: declares `schema`, inserts the sample
 * (and frame) documents directly into the underlying MongoDB collections with
 * their fixed ids, then applies `labelSchemas` and `savedViews`.
 */
export const build = (() => {
  const loader = new OssLoader();
  return async ({
    appConfig = {},
    datasetName,
    frames = [],
    groupSlices = [],
    indexes = [],
    labelSchemas = {},
    mediaType,
    orthographicProjections,
    promptableIndexes = [],
    sampleFrames = false,
    samples,
    savedViews = {},
    schema = {},
    staticTransforms = [],
    visualizations = [],
    workspaces = {},
  }: BuildOptions) => {
    const payload = writeToTmpFile(
      JSON.stringify({
        appConfig,
        frames,
        indexes,
        labelSchemas,
        samples,
        staticTransforms,
        visualizations,
      }),
      "json",
    );
    const hasVideo =
      mediaType === "video" ||
      groupSlices.some((slice) => slice.mediaType === "video");
    const mediaTypeCode =
      mediaType === "group"
        ? `dataset.add_group_field("group", default="${groupSlices[0]?.name}")
for name, media_type in ${JSON.stringify(
            groupSlices.map((slice) => [slice.name, slice.mediaType]),
          )}:
    if media_type == "3d" and "3d" in dataset._doc.group_media_types.values():
        # add_group_slice() allows one 3d slice; the App renders several
        dataset._doc.group_media_types[name] = media_type
        dataset.save()
    else:
        dataset.add_group_slice(name, media_type)`
        : `dataset.media_type = "${mediaType}"`;

    await loader.executePythonCode(`
from datetime import datetime

from bson import ObjectId, json_util

import fiftyone as fo
from fiftyone import ViewField as F
from fiftyone.core.camera import StaticTransform

with open("${payload}") as f:
    payload = json_util.loads(f.read())

if fo.dataset_exists("${datasetName}"):
    fo.delete_dataset("${datasetName}")

dataset = fo.Dataset("${datasetName}")
dataset.persistent = True
${mediaTypeCode}

${Object.entries(schema)
  .map(([fieldPath, fieldType]) => addField(fieldPath, fieldType))
  .join("\n")}

for transform in payload["staticTransforms"]:
    dataset.add_static_transform(StaticTransform(**transform))

now = datetime.now()

# add_samples() regenerates ids, so the fixed ids are kept by building each
# document with _make_dict and inserting it directly
docs = []
for spec in payload["samples"]:
    kwargs = {}
    if "group" in spec:
        kwargs["group"] = fo.Group(id=spec["group"]["id"]).element(
            spec["group"]["name"]
        )
    if "mediaType" in spec:
        kwargs["media_type"] = spec["mediaType"]
    sample = fo.Sample(
        _id=ObjectId(spec["id"]), filepath=spec["filepath"], **kwargs
    )
    sample.created_at = now
    sample.last_modified_at = now
    docs.append({**dataset._make_dict(sample, include_id=True), **spec["data"]})

dataset._sample_collection.insert_many(docs)

if payload["frames"]:
    frame_docs = []
    for spec in payload["frames"]:
        frame = fo.Frame(frame_number=spec["frameNumber"])
        frame_docs.append(
            {
                **dataset._make_dict(
                    frame, include_id=True, created_at=now, last_modified_at=now
                ),
                "_sample_id": ObjectId(spec["sampleId"]),
                **spec["data"],
            }
        )

    dataset._frame_collection.insert_many(frame_docs)

# raw inserts bypass the ODM, so every attribute the documents carry must be
# declared in the schema for the app to read it back
undeclared = dict(${
      mediaType === "group"
        ? "dataset.select_group_slices(_allow_mixed=True)"
        : "dataset"
    }.get_dynamic_field_schema())
if payload["frames"]:
    frame_schema = ${
      mediaType === "group"
        ? 'dataset.select_group_slices(media_type="video")'
        : "dataset"
    }.get_dynamic_frame_field_schema() or {}
    undeclared.update({f"frames.{path}": f for path, f in frame_schema.items()})
if undeclared:
    listed = "\\n".join(f"  {path}: {field}" for path, field in undeclared.items())
    raise ValueError(f"declare these in 'schema':\\n{listed}")

${hasVideo ? "dataset.compute_metadata()" : ""}
${
  sampleFrames
    ? mediaType === "group"
      ? 'dataset.select_group_slices(media_type="video").to_frames(sample_frames=True)'
      : "dataset.to_frames(sample_frames=True)"
    : ""
}

for field_name, label_schema in payload["labelSchemas"].items():
    dataset.update_label_schema(field_name, label_schema, allow_new_attrs=True)
${
  Object.keys(labelSchemas).length
    ? 'dataset.active_label_schemas = list(payload["labelSchemas"].keys())'
    : ""
}

${Object.entries(savedViews)
  .map(([name, view]) => `dataset.save_view("${name}", ${view})`)
  .join("\n")}

${Object.entries(workspaces)
  .map(([name, space]) => `dataset.save_workspace("${name}", ${space})`)
  .join("\n")}

for key, value in payload["appConfig"].items():
    if key == "color_scheme":
        value = fo.ColorScheme(**value)
    elif key == "sidebar_groups":
        value = [fo.SidebarGroupDocument(**group) for group in value]
    setattr(dataset.app_config, key, value)
if payload["appConfig"]:
    dataset.save()

for index_spec in payload["indexes"]:
    dataset.create_index(index_spec)

${
  orthographicProjections
    ? `import fiftyone.utils.utils3d as fou3d

fou3d.compute_orthographic_projection_images(
    dataset,
    ${JSON.stringify(orthographicProjections.size)},
    "${mediaDir(datasetName)}/orthographic-projections",
    skip_failures=${orthographicProjections.skipFailures ? "True" : "False"},
)`
    : ""
}

${
  promptableIndexes.length
    ? `import numpy as np
import fiftyone.brain as fob

for _key in ${JSON.stringify(promptableIndexes)}:
    fob.compute_similarity(
        dataset,
        embeddings=np.random.RandomState(51).rand(${samples.length}, 8),
        brain_key=_key,
        backend="sklearn",
    )
    # Naming a model would make compute_similarity load it, and the
    # quick-search UI reads only this flag.
    _run_doc = dataset._doc.brain_methods[_key]
    _run_doc.config["supports_prompts"] = True
    _run_doc.save()`
    : ""
}

${
  visualizations.length
    ? `import numpy as np
import fiftyone.brain as fob

# points keyed by sample (or label) id, so alignment never depends on
# iteration order
for _viz in payload["visualizations"]:
    _samples = (
        dataset.select_group_slices(_viz["slice"])
        if _viz["slice"]
        else dataset
    )
    _patches = _viz["patchesField"]
    if _patches:
        _points = {}
        for _id, _label_points in _viz["points"].items():
            _labels = _samples[_id][_patches]
            _items = getattr(_labels, _labels._LABEL_LIST_FIELD)
            # zip() would drop the extras, and the spec would fail later on
            # a count that doesn't say why
            if len(_label_points) != len(_items):
                raise ValueError(
                    f"{_viz['brainKey']}: sample {_id} has {len(_items)} "
                    f"{_patches} labels but {len(_label_points)} points"
                )
            for _label, _p in zip(_items, _label_points):
                _points[_label.id] = np.array(_p)
    else:
        _points = {_id: np.array(_p) for _id, _p in _viz["points"].items()}

    fob.compute_visualization(
        _samples,
        patches_field=_patches,
        points=_points,
        brain_key=_viz["brainKey"],
    )`
    : ""
}
`);
  };
})();
