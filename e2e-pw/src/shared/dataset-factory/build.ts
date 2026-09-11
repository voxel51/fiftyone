/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OssLoader } from "src/oss/fixtures/loader";
import { writeToTmpFile } from "src/oss/utils/fs";
import type {
  BaseDatasetOptions,
  FieldType,
  FrameSpec,
  GroupSliceConfig,
  Label,
  SampleSpec,
} from "./types";

/**
 * The set of field type strings that are considered FiftyOne label types.
 * Used by {@link isLabelType} to distinguish label fields from scalar fields.
 */
const LABEL_TYPES = new Set([
  "Classification",
  "Classifications",
  "Detection",
  "Detections",
  "Instance",
  "Polyline",
  "Polylines",
  "TemporalDetection",
  "TemporalDetections",
]);

/**
 * Type guard for the FiftyOne {@link Label} types.
 *
 * @example
 * isLabelType("Detection")  // true
 * isLabelType("FloatField") // false
 */
function isLabelType(fieldType: string): fieldType is Label {
  return LABEL_TYPES.has(fieldType);
}

export interface BuildOptions extends Pick<
  BaseDatasetOptions,
  "datasetName" | "labelSchemas" | "savedViews" | "schema"
> {
  mediaType: "image" | "video" | "3d" | "multimodal" | "group";
  samples: SampleSpec[];
  frames?: FrameSpec[];
  sampleFrames?: boolean;
  groupSlices?: GroupSliceConfig[];
}

/** `ListField<ListField<FloatField>>` → `fo.ListField(fo.ListField(fo.FloatField()))`. */
const fieldInstance = (fieldType: string): string => {
  const list = /^ListField<(.*)>$/.exec(fieldType);
  return list ? `fo.ListField(${fieldInstance(list[1])})` : `fo.${fieldType}()`;
};

const addField = (fieldPath: string, fieldType: FieldType) => {
  const isFrameField = fieldPath.startsWith("frames.");
  const method = isFrameField ? "add_frame_field" : "add_sample_field";
  const name = isFrameField ? fieldPath.slice("frames.".length) : fieldPath;
  if (isLabelType(fieldType)) {
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
    datasetName,
    frames = [],
    groupSlices = [],
    labelSchemas = {},
    mediaType,
    sampleFrames = false,
    samples,
    savedViews = {},
    schema = {},
  }: BuildOptions) => {
    const payload = writeToTmpFile(
      JSON.stringify({ samples, frames, labelSchemas }),
      "json",
    );
    const hasVideo =
      mediaType === "video" ||
      groupSlices.some((slice) => slice.mediaType === "video");
    const mediaTypeCode =
      mediaType === "group"
        ? [
            `dataset.add_group_field("group", default="${groupSlices[0]?.name}")`,
            ...groupSlices.map(
              (slice) =>
                `dataset.add_group_slice("${slice.name}", "${slice.mediaType}")`,
            ),
          ].join("\n")
        : `dataset.media_type = "${mediaType}"`;

    await loader.executePythonCode(`
from datetime import datetime

from bson import ObjectId, json_util

import fiftyone as fo
from fiftyone import ViewField as F

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
`);
  };
})();
