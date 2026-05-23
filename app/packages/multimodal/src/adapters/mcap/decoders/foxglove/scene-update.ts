import {
  type DecodedAttributeValue,
  type Decoder,
  type Quat,
  type RgbaColor,
  type SceneUpdateCube,
  type SceneUpdateEntity,
  type SceneUpdateVisualization,
  type Vec3,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_SCENE_UPDATE_PAYLOAD } from "./protobuf/payloads";
import {
  asRecord,
  optionalRecord,
  optionalString,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

/**
 * Decoder for Foxglove SceneUpdate protobuf messages. Only the cube
 * primitive is surfaced today — spheres, lines, arrows, triangles,
 * models, and texts are ignored until we render them.
 */
export const foxgloveSceneUpdateDecoder: Decoder = {
  id: "foxglove.scene-update",
  payload: FOXGLOVE_SCENE_UPDATE_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_SCENE_UPDATE_PAYLOAD,
      context
    );

    const rawEntities = optionalArray(message, "entities");
    const entities = rawEntities.map(decodeEntity);

    const firstEntityTs = entities[0]?.timestampNs;

    const visualization: SceneUpdateVisualization = {
      kind: VISUALIZATION_KIND.SCENE_UPDATE,
      entities,
    };

    const attributes: Record<string, DecodedAttributeValue> = {
      entityCount: entities.length,
      cubeCount: entities.reduce((sum, e) => sum + e.cubes.length, 0),
    };

    return {
      attributes,
      resourceHints: { sizeBytes: bytes.byteLength },
      timing: timingFromContext(context, firstEntityTs),
      visualization,
    };
  },
};

function decodeEntity(value: unknown): SceneUpdateEntity {
  const record = asRecord(value);
  const id = optionalString(record, "id") ?? "";
  const frameId =
    optionalString(record, "frameId", "frame_id") ?? "";
  const timestampRaw = optionalRecord(record, "timestamp");
  const timestampNsValue = timestampRaw ? timestampNs(timestampRaw) : undefined;
  const cubes = optionalArray(record, "cubes").map(decodeCube);
  const metadata = decodeMetadata(optionalArray(record, "metadata"));
  return {
    id,
    frameId,
    timestampNs: timestampNsValue ?? 0n,
    cubes,
    metadata,
  };
}

function decodeCube(value: unknown): SceneUpdateCube {
  const record = asRecord(value);
  const pose = optionalRecord(record, "pose");
  const position = decodeVec3(optionalRecord(pose ?? {}, "position"));
  const orientation = decodeQuat(optionalRecord(pose ?? {}, "orientation"));
  const size = decodeVec3(optionalRecord(record, "size"));
  const color = decodeColor(optionalRecord(record, "color"));
  return { position, orientation, size, color };
}

function decodeMetadata(
  entries: readonly unknown[]
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const k = record["key"];
    const v = record["value"];
    if (typeof k === "string" && typeof v === "string") out[k] = v;
  }
  return out;
}

function decodeVec3(record: Record<string, unknown> | undefined): Vec3 {
  if (!record) return [0, 0, 0];
  return [numberField(record, "x"), numberField(record, "y"), numberField(record, "z")];
}

function decodeQuat(record: Record<string, unknown> | undefined): Quat {
  if (!record) return [0, 0, 0, 1];
  return [
    numberField(record, "x"),
    numberField(record, "y"),
    numberField(record, "z"),
    numberField(record, "w", undefined, 1),
  ];
}

function decodeColor(
  record: Record<string, unknown> | undefined
): RgbaColor | null {
  if (!record) return null;
  return [
    numberField(record, "r"),
    numberField(record, "g"),
    numberField(record, "b"),
    numberField(record, "a"),
  ];
}

function optionalArray(
  record: Record<string, unknown>,
  field: string
): readonly unknown[] {
  const value = record[field];
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
  defaultValue = 0
): number {
  const value =
    record[field] ?? (fallbackField ? record[fallbackField] : undefined);
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return defaultValue;
}

