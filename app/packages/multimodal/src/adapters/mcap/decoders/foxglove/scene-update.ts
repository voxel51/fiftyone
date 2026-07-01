import {
  type DecodedAttributeValue,
  type Decoder,
  type RgbaColor,
  resourceHintsForArrayBufferViews,
  type SceneArrowPrimitive,
  type SceneCubePrimitive,
  type SceneCylinderPrimitive,
  type SceneEntityDeletionKind,
  type SceneEntityDeletionVisualization,
  type SceneEntityVisualization,
  type SceneLinePrimitive,
  type SceneLinePrimitiveKind,
  type SceneModelPrimitive,
  type ScenePoint3D,
  type ScenePose3D,
  type SceneSpherePrimitive,
  type SceneTextPrimitive,
  type SceneTrianglePrimitive,
  type SceneUpdateVisualization,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_SCENE_UPDATE_PAYLOAD } from "./protobuf/payloads";
import { asRecord, optionalRecord } from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const DELETION_KIND_BY_ENUM: Readonly<Record<number, SceneEntityDeletionKind>> =
  {
    0: "matching-id",
    1: "all",
  };
const DELETION_KIND_BY_STRING: Readonly<
  Record<string, SceneEntityDeletionKind>
> = {
  ALL: "all",
  MATCHING_ID: "matching-id",
};
const LINE_KIND_BY_ENUM: Readonly<Record<number, SceneLinePrimitiveKind>> = {
  0: "line-strip",
  1: "line-loop",
  2: "line-list",
};
const LINE_KIND_BY_STRING: Readonly<Record<string, SceneLinePrimitiveKind>> = {
  LINE_LIST: "line-list",
  LINE_LOOP: "line-loop",
  LINE_STRIP: "line-strip",
};

/**
 * Decoder for Foxglove SceneUpdate protobuf messages.
 */
export const foxgloveSceneUpdateDecoder: Decoder = {
  id: "foxglove.scene-update",
  payload: FOXGLOVE_SCENE_UPDATE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_SCENE_UPDATE_PAYLOAD,
      context,
    );

    const rawDeletions = optionalArray(message, "deletions");
    const rawEntities = optionalArray(message, "entities");
    const deletions = rawDeletions.map(decodeDeletion);
    const entities = rawEntities.map(decodeEntity);
    const primitiveCounts = primitiveCountsForEntities(entities);
    const modelDataHints = resourceHintsForArrayBufferViews(
      ...modelDataViewsForEntities(entities),
    );

    const visualization: SceneUpdateVisualization = {
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
      deletions,
      entities,
    };
    const attributes: Record<string, DecodedAttributeValue> = {
      deletionCount: deletions.length,
      entityCount: entities.length,
      ...primitiveCounts,
      unsupportedPrimitiveCount: 0,
    };

    return {
      attributes,
      resourceHints: {
        sizeBytes: bytes.byteLength + (modelDataHints.sizeBytes ?? 0),
        ...(modelDataHints.transferables?.length
          ? { transferables: modelDataHints.transferables }
          : {}),
      },
      timing: timingFromContext(
        context,
        firstSceneUpdateTimestamp(entities, deletions),
      ),
      visualization,
    };
  },
};

function decodeEntity(value: unknown): SceneEntityVisualization {
  const record = asRecord(value);
  const arrows = optionalArray(record, "arrows").map(decodeArrow);
  const cubes = optionalArray(record, "cubes").map(decodeCube);
  const cylinders = optionalArray(record, "cylinders").map(decodeCylinder);
  const frameId = optionalString(record, "frameId", "frame_id");
  const lines = optionalArray(record, "lines").map(decodeLine);
  const lifetime = durationNs(optionalRecord(record, "lifetime"));
  const metadata = decodeMetadata(optionalArray(record, "metadata"));
  const models = optionalArray(record, "models").map(decodeModel);
  const spheres = optionalArray(record, "spheres").map(decodeSphere);
  const texts = optionalArray(record, "texts").map(decodeText);
  const timestamp = timestampNs(optionalRecord(record, "timestamp"));
  const triangles = optionalArray(record, "triangles").map(decodeTriangle);

  return {
    arrowCount: arrows.length,
    arrows,
    cubeCount: cubes.length,
    cubes,
    cylinderCount: cylinders.length,
    cylinders,
    ...(frameId ? { frameId } : {}),
    frameLocked: booleanField(record, "frameLocked", "frame_locked"),
    id: stringField(record, "id"),
    lineCount: lines.length,
    lines,
    ...(lifetime !== undefined ? { lifetimeNs: lifetime } : {}),
    metadata,
    modelCount: models.length,
    models,
    sphereCount: spheres.length,
    spheres,
    textCount: texts.length,
    texts,
    ...(timestamp !== undefined ? { timestampNs: timestamp } : {}),
    triangleCount: triangles.length,
    triangles,
  };
}

function decodeDeletion(value: unknown): SceneEntityDeletionVisualization {
  const record = asRecord(value);
  const timestamp = timestampNs(optionalRecord(record, "timestamp"));

  return {
    id: stringField(record, "id"),
    ...(timestamp !== undefined ? { timestampNs: timestamp } : {}),
    type: decodeDeletionKind(record["type"]),
  };
}

function decodeCube(value: unknown): SceneCubePrimitive {
  const record = asRecord(value);

  return {
    color: decodeColor(optionalRecord(record, "color")),
    pose: decodePose(optionalRecord(record, "pose")),
    size: decodeVector3(optionalRecord(record, "size")),
  };
}

function decodeArrow(value: unknown): SceneArrowPrimitive {
  const record = asRecord(value);

  return {
    color: decodeColor(optionalRecord(record, "color")),
    headDiameter: numberField(record, "headDiameter", "head_diameter"),
    headLength: numberField(record, "headLength", "head_length"),
    pose: decodePose(optionalRecord(record, "pose")),
    shaftDiameter: numberField(record, "shaftDiameter", "shaft_diameter"),
    shaftLength: numberField(record, "shaftLength", "shaft_length"),
  };
}

function decodeCylinder(value: unknown): SceneCylinderPrimitive {
  const record = asRecord(value);

  return {
    bottomScale: numberField(record, "bottomScale", "bottom_scale", 1),
    color: decodeColor(optionalRecord(record, "color")),
    pose: decodePose(optionalRecord(record, "pose")),
    size: decodeVector3(optionalRecord(record, "size")),
    topScale: numberField(record, "topScale", "top_scale", 1),
  };
}

function decodeLine(value: unknown): SceneLinePrimitive {
  const record = asRecord(value);

  return {
    color: decodeColor(optionalRecord(record, "color")),
    colors: optionalArray(record, "colors")
      .map((color) => decodeColor(asRecord(color)))
      .filter((color): color is RgbaColor => color !== null),
    indices: decodeIndices(optionalArray(record, "indices")),
    points: optionalArray(record, "points").map(decodePoint3),
    pose: decodePose(optionalRecord(record, "pose")),
    scaleInvariant: booleanField(record, "scaleInvariant", "scale_invariant"),
    thickness: numberField(record, "thickness"),
    type: decodeLineKind(record["type"]),
  };
}

function decodeModel(value: unknown): SceneModelPrimitive {
  const record = asRecord(value);
  const data = optionalBytes(record, "data");

  return {
    color: decodeColor(optionalRecord(record, "color")),
    ...(data ? { data } : {}),
    mediaType: stringField(record, "mediaType", "media_type"),
    overrideColor: booleanField(record, "overrideColor", "override_color"),
    pose: decodePose(optionalRecord(record, "pose")),
    scale: decodeVector3(optionalRecord(record, "scale"), [1, 1, 1]),
    url: stringField(record, "url"),
  };
}

function decodeSphere(value: unknown): SceneSpherePrimitive {
  const record = asRecord(value);

  return {
    color: decodeColor(optionalRecord(record, "color")),
    pose: decodePose(optionalRecord(record, "pose")),
    size: decodeVector3(optionalRecord(record, "size")),
  };
}

function decodeText(value: unknown): SceneTextPrimitive {
  const record = asRecord(value);

  return {
    billboard: booleanField(record, "billboard"),
    color: decodeColor(optionalRecord(record, "color")),
    fontSize: numberField(record, "fontSize", "font_size"),
    pose: decodePose(optionalRecord(record, "pose")),
    scaleInvariant: booleanField(record, "scaleInvariant", "scale_invariant"),
    text: stringField(record, "text"),
  };
}

function decodeTriangle(value: unknown): SceneTrianglePrimitive {
  const record = asRecord(value);

  return {
    color: decodeColor(optionalRecord(record, "color")),
    colors: optionalArray(record, "colors")
      .map((color) => decodeColor(asRecord(color)))
      .filter((color): color is RgbaColor => color !== null),
    indices: decodeIndices(optionalArray(record, "indices")),
    points: optionalArray(record, "points").map(decodePoint3),
    pose: decodePose(optionalRecord(record, "pose")),
  };
}

function decodePose(record: Record<string, unknown> | undefined): ScenePose3D {
  if (!record) {
    return {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    };
  }

  return {
    position: decodeVector3(optionalRecord(record, "position")),
    quaternion: decodeQuaternion(optionalRecord(record, "orientation")),
  };
}

function decodeVector3(
  record: Record<string, unknown> | undefined,
  defaultValue: readonly [number, number, number] = [0, 0, 0],
): readonly [number, number, number] {
  if (!record) return defaultValue;

  return [
    numberField(record, "x", undefined, defaultValue[0]),
    numberField(record, "y", undefined, defaultValue[1]),
    numberField(record, "z", undefined, defaultValue[2]),
  ];
}

function decodeQuaternion(
  record: Record<string, unknown> | undefined,
): readonly [number, number, number, number] {
  if (!record) return [0, 0, 0, 1];

  return [
    numberField(record, "x"),
    numberField(record, "y"),
    numberField(record, "z"),
    numberField(record, "w", undefined, 1),
  ];
}

function decodeColor(
  record: Record<string, unknown> | undefined,
): RgbaColor | null {
  if (!record) return null;

  return [
    numberField(record, "r"),
    numberField(record, "g"),
    numberField(record, "b"),
    numberField(record, "a", undefined, 1),
  ];
}

function decodePoint3(value: unknown): ScenePoint3D {
  return decodeVector3(asRecord(value));
}

function decodeLineKind(value: unknown): SceneLinePrimitiveKind {
  if (typeof value === "number") {
    return LINE_KIND_BY_ENUM[value] ?? "line-strip";
  }
  if (typeof value === "bigint") {
    return LINE_KIND_BY_ENUM[Number(value)] ?? "line-strip";
  }
  if (typeof value === "string") {
    return LINE_KIND_BY_STRING[value] ?? "line-strip";
  }

  return "line-strip";
}

function decodeMetadata(
  rawMetadata: readonly unknown[],
): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {};
  for (const entry of rawMetadata) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const key = stringField(record, "key");
    if (!key) {
      continue;
    }
    metadata[key] = stringField(record, "value");
  }

  return metadata;
}

function modelDataViewsForEntities(
  entities: readonly SceneEntityVisualization[],
) {
  return entities.flatMap((entity) =>
    entity.models.flatMap((model) => (model.data ? [model.data] : [])),
  );
}

function primitiveCountsForEntities(
  entities: readonly SceneEntityVisualization[],
) {
  return {
    arrowCount: sum(entities, (entity) => entity.arrowCount),
    cubeCount: sum(entities, (entity) => entity.cubeCount),
    cylinderCount: sum(entities, (entity) => entity.cylinderCount),
    lineCount: sum(entities, (entity) => entity.lineCount),
    modelCount: sum(entities, (entity) => entity.modelCount),
    sphereCount: sum(entities, (entity) => entity.sphereCount),
    textCount: sum(entities, (entity) => entity.textCount),
    triangleCount: sum(entities, (entity) => entity.triangleCount),
  };
}

function firstSceneUpdateTimestamp(
  entities: readonly SceneEntityVisualization[],
  deletions: readonly SceneEntityDeletionVisualization[],
): bigint | undefined {
  for (const entity of entities) {
    if (entity.timestampNs !== undefined) {
      return entity.timestampNs;
    }
  }
  for (const deletion of deletions) {
    if (deletion.timestampNs !== undefined) {
      return deletion.timestampNs;
    }
  }

  return undefined;
}

function durationNs(
  record: Record<string, unknown> | undefined,
): bigint | undefined {
  if (!record) return undefined;

  const seconds = bigintField(record, "seconds") ?? 0n;
  const nanos = bigintField(record, "nanos") ?? 0n;

  return seconds * NANOSECONDS_PER_SECOND + nanos;
}

function optionalArray(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): readonly unknown[] {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Field '${field}' is not an array`);
  }
  return value;
}

function decodeIndices(values: readonly unknown[]): readonly number[] {
  return values
    .map((value) => {
      if (typeof value === "number") return value;
      if (typeof value === "bigint") return Number(value);
      if (typeof value === "string") return Number(value);
      return NaN;
    })
    .filter(
      (value) =>
        Number.isInteger(value) && Number.isFinite(value) && value >= 0,
    );
}

function numberField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
  defaultValue = 0,
): number {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}

function bigintField(
  record: Record<string, unknown>,
  field: string,
): bigint | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return undefined;
    }
  }
  if (
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    try {
      return BigInt(value.toString());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): string {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  return typeof value === "string" ? value : "";
}

function optionalString(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): string | undefined {
  const value = stringField(record, field, fallbackField);
  return value ? value : undefined;
}

function optionalBytes(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): Uint8Array | undefined {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);

  return undefined;
}

function booleanField(
  record: Record<string, unknown>,
  field: string,
  fallbackField?: string,
): boolean {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  return typeof value === "boolean" ? value : false;
}

function decodeDeletionKind(value: unknown): SceneEntityDeletionKind {
  if (typeof value === "number") {
    return DELETION_KIND_BY_ENUM[value] ?? "matching-id";
  }
  if (typeof value === "string") {
    return DELETION_KIND_BY_STRING[value] ?? "matching-id";
  }
  return "matching-id";
}

function sum<T>(values: readonly T[], select: (value: T) => number) {
  return values.reduce((total, value) => total + select(value), 0);
}
