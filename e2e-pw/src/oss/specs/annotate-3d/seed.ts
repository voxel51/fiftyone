/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type {
  Dataset3dOptions,
  JSONObject,
  LabelSchema,
  Schema,
} from "src/shared/dataset-factory";

export interface Annotate3dSeedOptions {
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
  /**
   * Extra attributes appended to the `detections` annotation schema, e.g.
   * `{ name: "type", type: "str", component: "text" }`, declared as dynamic
   * fields on the dataset. Use to declare user attributes whose names collide
   * with UI bookkeeping (`type`, `color`, `isNew`, ...).
   */
  detectionAttributes?: { name: string; type: string; component?: string }[];
  /**
   * Initial attribute values stamped on every pre-seeded cuboid as dynamic
   * `Detection` fields.
   */
  cuboidAttributeValues?: Record<string, string>;
}

type Seed = Required<
  Pick<Dataset3dOptions, "labelSchemas" | "schema" | "withSampleData">
>;

const ATTRIBUTE_FIELD_TYPES: { [type: string]: Schema[string] } = {
  str: "StringField",
  int: "IntField",
  float: "FloatField",
  bool: "BooleanField",
};

const COMMON_ATTRIBUTES = [
  { name: "id", type: "id", component: "text", read_only: true },
  { name: "tags", type: "list<str>", component: "text" },
];

/**
 * Builds the `create3dDataset` arguments for a 3D-annotation dataset: a
 * declared + active sample-level `detections` annotation schema and an
 * optional pre-seeded cuboid (`fo.Detection` with 3D geometry) on requested
 * samples.
 *
 * A 3D cuboid is a `fo.Detection` carrying `location` ([x,y,z] center),
 * `dimensions` ([l,w,h]) and `rotation` ([x,y,z] euler) — the same field the
 * `detection3dAdapter` renders on the annotation engine. A 3D polyline carries
 * `points3d` (a list of [x,y,z] segments) as a dynamic attribute — `points`
 * stays empty (it's the 2D field).
 *
 * @example
 * await datasetFactory.create3dDataset({
 *   datasetName,
 *   ...annotate3dSeed({ classes: ["car", "truck"], cuboidSampleIndices: [0] }),
 * });
 */
export const annotate3dSeed = ({
  classes = ["car", "truck", "pedestrian"],
  cuboidSampleIndices = [0],
  polylineClasses,
  polylineSampleIndices = [0],
  detectionAttributes = [],
  cuboidAttributeValues = {},
}: Annotate3dSeedOptions = {}): Seed => {
  const cuboids = new Set(cuboidSampleIndices);
  const polylines = new Set(polylineClasses ? polylineSampleIndices : []);

  const schema: Schema = { detections: "Detections" };
  for (const attr of detectionAttributes) {
    schema[`detections.detections.${attr.name}`] =
      ATTRIBUTE_FIELD_TYPES[attr.type];
  }
  if (polylineClasses) {
    schema.polylines = "Polylines";
    schema["polylines.polylines.points3d"] = "ListField";
  }

  const labelSchemas: { [field: string]: LabelSchema } = {};
  // detections stays active when a cuboid is requested OR when no polyline
  // schema is present at all (the cuboid-only shape)
  if (cuboids.size > 0 || !polylineClasses) {
    labelSchemas.detections = {
      type: "detections",
      component: "dropdown",
      attributes: [
        ...COMMON_ATTRIBUTES,
        ...detectionAttributes.map((attr) => ({ component: "text", ...attr })),
      ],
      classes,
    };
  }
  if (polylineClasses) {
    labelSchemas.polylines = {
      type: "polylines",
      component: "dropdown",
      attributes: COMMON_ATTRIBUTES,
      classes: polylineClasses,
    };
  }

  const withSampleData: Seed["withSampleData"] = ({ index }, { createId }) => {
    const sample: JSONObject = {
      detections: {
        _cls: "Detections",
        detections: cuboids.has(index)
          ? [
              {
                _id: createId(),
                _cls: "Detection",
                tags: [],
                label: classes[0],
                location: [0, 0, 0],
                dimensions: [2, 2, 2],
                rotation: [0, 0, 0],
                ...cuboidAttributeValues,
              },
            ]
          : [],
      },
    };
    if (polylineClasses) {
      sample.polylines = {
        _cls: "Polylines",
        polylines: polylines.has(index)
          ? [
              {
                _id: createId(),
                _cls: "Polyline",
                tags: [],
                label: polylineClasses[0],
                points: [],
                points3d: [
                  [
                    [0, 0, 0],
                    [1, 0, 0],
                    [1, 1, 0],
                  ],
                ],
                closed: false,
                filled: false,
              },
            ]
          : [],
      };
    }
    return sample;
  };

  return { schema, labelSchemas, withSampleData };
};
