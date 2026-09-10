/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  JSONObject,
  LabelSchema,
  Schema,
  VideoDatasetOptions,
} from "src/shared/dataset-factory";
import { createId } from "src/shared/utils";

export interface VideoAnnotationSeedOptions {
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
   * existing track. Defaults to none (a clean slate).
   */
  trackedSampleIndices?: number[];
  /**
   * Sample indices that should carry a SECOND tracked instance (`index=2`,
   * class `classes[secondTrackClassIndex]`, on every frame) alongside the
   * first — so tests can exercise multi-track ops like merge. Additive;
   * defaults to none.
   */
  secondTrackSampleIndices?: number[];
  /**
   * Class index (into `classes`) for the SECOND tracked instance, 1 by default
   * so the two tracks differ in class. Set to 0 for a same-class pair, which
   * merge requires.
   */
  secondTrackClassIndex?: number;
  /**
   * Subset of {@link trackedSampleIndices} whose tracked detection should also
   * carry an instance mask (a full all-ones mask) on every frame, so tests can
   * confirm detection masks render / decode on the video surface.
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
   * Declare the `frames.polylines` field + activate its schema (with empty
   * polylines on every frame) without pre-seeding a track, so a clean-slate
   * test can draw the first polyline. Implied by a non-empty
   * {@link polylineSampleIndices}.
   */
  withPolylineField?: boolean;
  /**
   * Optional string attribute declared `dynamic` in the `frames.detections`
   * schema (a dropdown over `values`) and seeded to `values[0]` on every frame
   * of the tracked detection — so tests can exercise dynamic-attribute
   * forward-fill propagation.
   */
  dynamicAttribute?: { name: string; values: string[] };
  /**
   * Multiple dynamic attributes, each a dropdown over its `values` seeded to
   * `values[0]` on every frame of the tracked detection. Takes precedence over
   * {@link dynamicAttribute}.
   */
  dynamicAttributes?: Array<{ name: string; values: string[] }>;
}

type Seed = Required<
  Pick<
    VideoDatasetOptions,
    | "labelSchemas"
    | "sampleFrames"
    | "schema"
    | "withFrameData"
    | "withSampleData"
  >
>;

const ID_ATTRIBUTE = {
  name: "id",
  type: "id",
  component: "text",
  read_only: true,
};

/**
 * Builds the `createDataset({ mediaType: "video" })` arguments for a
 * video-annotation dataset: declared frame fields with an active
 * `frames.detections` annotation schema
 * (keyed by its real frame path), an active sample-level `events`
 * TemporalDetections schema, materialized per-frame images for the ImaVid
 * tile, and empty-but-present `frames.detections` on every frame so the first
 * draw's JSON patch can append.
 *
 * @example
 * await datasetFactory.createDataset({
 *   mediaType: "video",
 *   datasetName,
 *   ...videoAnnotationSeed({ withEvents: false, trackedSampleIndices: [0] }),
 * });
 */
export const videoAnnotationSeed = ({
  classes = ["vehicle", "person", "road sign"],
  eventClasses = ["approach", "pass", "depart"],
  withEvents = true,
  trackedSampleIndices = [],
  secondTrackSampleIndices = [],
  secondTrackClassIndex = 1,
  maskedSampleIndices = [],
  polylineSampleIndices = [],
  withPolylineField = false,
  dynamicAttribute,
  dynamicAttributes,
}: VideoAnnotationSeedOptions = {}): Seed => {
  const tracked = new Set(trackedSampleIndices);
  const secondTracked = new Set(secondTrackSampleIndices);
  const secondTrackClass = classes[secondTrackClassIndex];
  const masked = new Set(maskedSampleIndices);
  const polylineTracked = new Set(polylineSampleIndices);
  const polylineSchema = polylineTracked.size > 0 || withPolylineField;
  const dynAttrs =
    dynamicAttributes ?? (dynamicAttribute ? [dynamicAttribute] : []);

  const schema: Schema = {
    "frames.detections": "Detections",
    "frames.detections.detections.keyframe": "BooleanField",
    "frames.detections.detections.propagation": "DictField",
  };
  for (const attr of dynAttrs) {
    schema[`frames.detections.detections.${attr.name}`] = "StringField";
  }
  if (polylineSchema) {
    schema["frames.polylines"] = "Polylines";
    schema["frames.polylines.polylines.keyframe"] = "BooleanField";
    schema["frames.polylines.polylines.propagation"] = "DictField";
  }
  schema.events = "TemporalDetections";

  const labelSchemas: { [field: string]: LabelSchema } = {
    "frames.detections": {
      type: "detections",
      component: "dropdown",
      attributes: [
        ID_ATTRIBUTE,
        { name: "tags", type: "list<str>", component: "text" },
        { name: "confidence", type: "float", component: "text" },
        { name: "index", type: "int", component: "text" },
        { name: "mask_path", type: "str", component: "text" },
        ...dynAttrs.map((attr) => ({
          name: attr.name,
          type: "str",
          component: "dropdown",
          values: attr.values,
          dynamic: true,
        })),
      ],
      classes,
    },
  };
  if (polylineSchema) {
    labelSchemas["frames.polylines"] = {
      type: "polylines",
      component: "dropdown",
      attributes: [
        ID_ATTRIBUTE,
        { name: "index", type: "int", component: "text" },
      ],
      classes,
    };
  }
  labelSchemas.events = {
    type: "temporaldetections",
    component: "dropdown",
    attributes: [ID_ATTRIBUTE],
    classes: eventClasses,
  };

  // one Instance per (sample, label type, class, index) track, shared by
  // every frame's label of that track
  const instances = new Map<string, JSONObject>();
  const instance = (
    sampleIndex: number,
    cls: string,
    label: string,
    index: number,
  ): JSONObject => {
    const key = `${sampleIndex}:${cls}:${label}:${index}`;
    let doc = instances.get(key);
    if (!doc) {
      doc = { _id: createId(), _cls: "Instance" };
      instances.set(key, doc);
    }
    return doc;
  };

  const withSampleData: Seed["withSampleData"] = ({ numFrames }, helpers) => {
    if (!withEvents) {
      return {};
    }
    // approach / pass / depart thirds
    const a = Math.max(1, Math.floor(numFrames / 3));
    const b = Math.max(a + 1, Math.floor((2 * numFrames) / 3));
    const event = (label: string, support: [number, number]): JSONObject => ({
      _id: helpers.createId(),
      _cls: "TemporalDetection",
      tags: [],
      label,
      support,
    });
    return {
      events: {
        _cls: "TemporalDetections",
        detections: [
          event(eventClasses[0], [1, a]),
          event(eventClasses[1], [a + 1, b]),
          event(eventClasses[2], [b + 1, numFrames]),
        ],
      },
    };
  };

  const withFrameData: Seed["withFrameData"] = ({ sampleIndex }, helpers) => {
    const detections: JSONObject[] = [];
    if (tracked.has(sampleIndex)) {
      detections.push({
        _id: helpers.createId(),
        _cls: "Detection",
        tags: [],
        label: classes[0],
        bounding_box: [0.3, 0.3, 0.2, 0.2],
        index: 1,
        instance: instance(sampleIndex, "Detection", classes[0], 1),
        ...(masked.has(sampleIndex) ? { mask: helpers.mask(20, 20) } : {}),
        ...Object.fromEntries(
          dynAttrs.map((attr) => [attr.name, attr.values[0]]),
        ),
      });
    }
    if (secondTracked.has(sampleIndex)) {
      detections.push({
        _id: helpers.createId(),
        _cls: "Detection",
        tags: [],
        label: secondTrackClass,
        bounding_box: [0.55, 0.55, 0.2, 0.2],
        index: 2,
        instance: instance(sampleIndex, "Detection", secondTrackClass, 2),
      });
    }

    const frame: JSONObject = {
      detections: { _cls: "Detections", detections },
    };
    if (polylineSchema) {
      frame.polylines = {
        _cls: "Polylines",
        polylines: polylineTracked.has(sampleIndex)
          ? [
              {
                _id: helpers.createId(),
                _cls: "Polyline",
                tags: [],
                label: classes[1],
                points: [
                  [
                    [0.2, 0.2],
                    [0.5, 0.2],
                    [0.35, 0.5],
                  ],
                ],
                closed: true,
                filled: false,
                index: 2,
                instance: instance(sampleIndex, "Polyline", classes[1], 2),
              },
            ]
          : [],
      };
    }
    return frame;
  };

  return {
    schema,
    labelSchemas,
    withSampleData,
    withFrameData,
    sampleFrames: true,
  };
};
