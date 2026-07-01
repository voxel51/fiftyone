import {
  type DecodedAttributeValue,
  type Decoder,
  type RgbaColor,
  type SceneCubePrimitive,
  type SceneEntityDeletionKind,
  type SceneEntityDeletionVisualization,
  type SceneEntityVisualization,
  type ScenePose3D,
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

    const visualization: SceneUpdateVisualization = {
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
      deletions,
      entities,
    };
    const attributes: Record<string, DecodedAttributeValue> = {
      deletionCount: deletions.length,
      entityCount: entities.length,
      ...primitiveCounts,
      unsupportedPrimitiveCount:
        primitiveCounts.arrowCount +
        primitiveCounts.cylinderCount +
        primitiveCounts.lineCount +
        primitiveCounts.modelCount +
        primitiveCounts.sphereCount +
        primitiveCounts.textCount +
        primitiveCounts.triangleCount,
    };

    return {
      attributes,
      resourceHints: { sizeBytes: bytes.byteLength },
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
  const cubes = optionalArray(record, "cubes").map(decodeCube);
  const frameId = optionalString(record, "frameId", "frame_id");
  const lifetime = durationNs(optionalRecord(record, "lifetime"));
  const metadata = decodeMetadata(optionalArray(record, "metadata"));
  const timestamp = timestampNs(optionalRecord(record, "timestamp"));

  return {
    arrowCount: optionalArray(record, "arrows").length,
    cubeCount: cubes.length,
    cubes,
    cylinderCount: optionalArray(record, "cylinders").length,
    ...(frameId ? { frameId } : {}),
    frameLocked: booleanField(record, "frameLocked", "frame_locked"),
    id: stringField(record, "id"),
    lineCount: optionalArray(record, "lines").length,
    ...(lifetime !== undefined ? { lifetimeNs: lifetime } : {}),
    metadata,
    modelCount: optionalArray(record, "models").length,
    sphereCount: optionalArray(record, "spheres").length,
    textCount: optionalArray(record, "texts").length,
    ...(timestamp !== undefined ? { timestampNs: timestamp } : {}),
    triangleCount: optionalArray(record, "triangles").length,
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
): readonly [number, number, number] {
  if (!record) return [0, 0, 0];

  return [
    numberField(record, "x"),
    numberField(record, "y"),
    numberField(record, "z"),
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
