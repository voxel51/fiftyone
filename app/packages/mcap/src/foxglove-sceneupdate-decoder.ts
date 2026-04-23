import * as THREE from "three";
import type { Scene3dPrimitive, Scene3dPrimitiveSemantic } from "./archetypes";
import {
  decodeFoxgloveSceneUpdateMessage,
  type FoxgloveArrowPrimitiveMessage,
  type FoxgloveCubePrimitiveMessage,
  type FoxgloveLinePrimitiveMessage,
  type FoxglovePose,
  type FoxgloveSceneEntityMessage,
  type FoxgloveSpherePrimitiveMessage,
} from "./foxglove-protobuf";

const LINE_TYPE_STRIP = 0;
const LINE_TYPE_LOOP = 1;
const LINE_TYPE_LIST = 2;
const SCENE_UPDATE_COLOR_KEY_KEYS = [
  ".label",
  "label",
  ".category",
  "category",
];
const SCENE_UPDATE_TITLE_KEYS = [
  ...SCENE_UPDATE_COLOR_KEY_KEYS,
  "class",
  "type",
  "name",
  "namespace",
  "ns",
];
const MAX_SCENE_UPDATE_SEMANTIC_ENTRIES = 4;

type SceneEntityMetadataEntry = {
  label: string;
  normalizedLabel: string;
  value: string;
};

export type DecodedFoxgloveSceneEntityState = {
  frameId: string | null;
  id: string;
  timestampNs: number;
  expiresAtNs: number | null;
  frameLocked: boolean;
  semantic: Scene3dPrimitiveSemantic;
  semanticColor: string;
  primitives: Scene3dPrimitive[];
  warnings: string[];
};

export type DecodedFoxgloveSceneDeletion = {
  id: string;
  timestampNs: number;
  type: number;
};

export type DecodedFoxgloveSceneUpdate = {
  entities: DecodedFoxgloveSceneEntityState[];
  deletions: DecodedFoxgloveSceneDeletion[];
};

function decodeTimestampNs(
  timestamp:
    | { seconds?: number | null; nanos?: number | null }
    | null
    | undefined
) {
  if (!timestamp) {
    return null;
  }

  return (
    Number(timestamp.seconds ?? 0) * 1_000_000_000 +
    Number(timestamp.nanos ?? 0)
  );
}

function decodeDurationNs(
  duration:
    | { seconds?: number | null; nanos?: number | null }
    | null
    | undefined
) {
  if (!duration) {
    return 0;
  }

  return (
    Number(duration.seconds ?? 0) * 1_000_000_000 + Number(duration.nanos ?? 0)
  );
}

function normalizeQuaternion(
  quaternion:
    | {
        x?: number | null;
        y?: number | null;
        z?: number | null;
        w?: number | null;
      }
    | null
    | undefined
) {
  const value = new THREE.Quaternion(
    Number(quaternion?.x ?? 0),
    Number(quaternion?.y ?? 0),
    Number(quaternion?.z ?? 0),
    Number(quaternion?.w ?? 1)
  );

  if (!value.lengthSq()) {
    value.set(0, 0, 0, 1);
  } else {
    value.normalize();
  }

  return value;
}

function createPoseMatrix(pose: FoxglovePose | null | undefined) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(
      Number(pose?.position?.x ?? 0),
      Number(pose?.position?.y ?? 0),
      Number(pose?.position?.z ?? 0)
    ),
    normalizeQuaternion(pose?.orientation),
    new THREE.Vector3(1, 1, 1)
  );
}

function transformPoints(points: number[], matrix: THREE.Matrix4) {
  const transformed = new Float32Array(points.length);
  const point = new THREE.Vector3();

  for (let index = 0; index < points.length; index += 3) {
    point.set(points[index], points[index + 1], points[index + 2]);
    point.applyMatrix4(matrix);
    transformed[index] = point.x;
    transformed[index + 1] = point.y;
    transformed[index + 2] = point.z;
  }

  return transformed;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function decodeIndexedLinePoints(message: FoxgloveLinePrimitiveMessage) {
  const sourcePoints =
    message.points?.map((point) => [
      Number(point.x ?? 0),
      Number(point.y ?? 0),
      Number(point.z ?? 0),
    ]) ?? [];
  const sourceColors = message.colors ?? [];
  const indices = message.indices ?? [];

  if (!indices.length) {
    return {
      points: sourcePoints,
      colors: sourceColors,
    };
  }

  return {
    points: indices
      .map((index) => sourcePoints[index] ?? null)
      .filter((value): value is [number, number, number] => Boolean(value)),
    colors: indices
      .map((index) => sourceColors[index] ?? null)
      .filter((value): value is NonNullable<typeof sourceColors>[number] =>
        Boolean(value)
      ),
  };
}

function decodeMetadataEntries(entity: FoxgloveSceneEntityMessage) {
  return (entity.metadata ?? [])
    .map((entry) => {
      const label = (entry.key ?? "").trim();
      const value = (entry.value ?? "").trim();
      if (!label || !value) {
        return null;
      }

      return {
        label,
        normalizedLabel: label.toLocaleLowerCase(),
        value,
      };
    })
    .filter((value): value is SceneEntityMetadataEntry => Boolean(value));
}

function getMetadataValue(
  entries: SceneEntityMetadataEntry[],
  candidateKeys: string[]
) {
  for (const key of candidateKeys) {
    const match = entries.find((entry) => entry.normalizedLabel === key);
    if (match) {
      return match.value;
    }
  }

  return null;
}

function getSceneEntitySemanticKey(
  entityId: string,
  frameId: string | null,
  metadataEntries: SceneEntityMetadataEntry[]
) {
  return (
    getMetadataValue(metadataEntries, SCENE_UPDATE_COLOR_KEY_KEYS) ??
    (entityId || frameId || "annotation")
  );
}

function createSceneEntitySemantic(
  entityId: string,
  frameId: string | null,
  metadataEntries: SceneEntityMetadataEntry[]
): Scene3dPrimitiveSemantic {
  const title =
    getMetadataValue(metadataEntries, SCENE_UPDATE_TITLE_KEYS) ??
    getSceneEntitySemanticKey(entityId, frameId, metadataEntries);
  const entries: Scene3dPrimitiveSemantic["entries"] = [];

  if (entityId && entityId !== title) {
    entries.push({ label: "id", value: entityId });
  }

  if (frameId && frameId !== title) {
    entries.push({ label: "frame", value: frameId });
  }

  metadataEntries.forEach((entry) => {
    if (entries.length >= MAX_SCENE_UPDATE_SEMANTIC_ENTRIES) {
      return;
    }

    if (
      entry.value === title &&
      SCENE_UPDATE_TITLE_KEYS.includes(entry.normalizedLabel)
    ) {
      return;
    }

    if (entry.normalizedLabel === "id" && entry.value === entityId) {
      return;
    }

    if (
      (entry.normalizedLabel === "frame" ||
        entry.normalizedLabel === "frame_id") &&
      entry.value === frameId
    ) {
      return;
    }

    entries.push({
      label: entry.label,
      value: entry.value,
    });
  });

  if (!entries.length && entityId) {
    entries.push({ label: "id", value: entityId });
  }

  return {
    title,
    entries,
  };
}

function getSceneEntitySemanticColor(colorKey: string) {
  const hash = hashString(colorKey);
  const hue = hash % 360;
  const saturation = 68 + (hash % 10);
  const lightness = 58 + ((hash >> 9) % 8);

  return `#${new THREE.Color()
    .setHSL(hue / 360, saturation / 100, lightness / 100)
    .getHexString()}`;
}

function applySceneEntitySemantic(
  primitive: Scene3dPrimitive,
  entity: Pick<DecodedFoxgloveSceneEntityState, "semantic" | "semanticColor">
): Scene3dPrimitive {
  if (primitive.kind === "points") {
    return {
      ...primitive,
      intensity: null,
      colors: null,
      semantic: entity.semantic,
      solidColor: entity.semanticColor,
    };
  }

  return {
    ...primitive,
    colors: null,
    semantic: entity.semantic,
    solidColor: entity.semanticColor,
  };
}

function decodeArrowPrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveArrowPrimitiveMessage,
  index: number
): Scene3dPrimitive {
  const shaftLength = Math.max(0, Number(primitive.shaftLength ?? 0));
  const headLength = Math.max(0, Number(primitive.headLength ?? 0));
  const tipX = shaftLength + headLength;
  const headWidth = Math.max(
    Number(primitive.headDiameter ?? primitive.shaftDiameter ?? 0.08) / 2,
    0.04
  );
  const poseMatrix = createPoseMatrix(primitive.pose);
  const positions = transformPoints(
    [
      0,
      0,
      0,
      shaftLength,
      0,
      0,
      shaftLength,
      0,
      0,
      tipX,
      0,
      0,
      tipX,
      0,
      0,
      shaftLength,
      headWidth,
      0,
      tipX,
      0,
      0,
      shaftLength,
      -headWidth,
      0,
    ],
    poseMatrix
  );

  return applySceneEntitySemantic(
    {
      kind: "line-list",
      id: `${entity.id}:arrow:${index}`,
      frameId: entity.frameId,
      positions,
      colors: null,
      solidColor: null,
    },
    entity
  );
}

function decodeCubePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveCubePrimitiveMessage,
  index: number
): Scene3dPrimitive {
  const position = primitive.pose?.position ?? null;
  const rotation = normalizeQuaternion(primitive.pose?.orientation);
  const size = primitive.size ?? null;

  return applySceneEntitySemantic(
    {
      kind: "cube-list",
      id: `${entity.id}:cube:${index}`,
      frameId: entity.frameId,
      positions: new Float32Array([
        Number(position?.x ?? 0),
        Number(position?.y ?? 0),
        Number(position?.z ?? 0),
      ]),
      scales: new Float32Array([
        Number(size?.x ?? 1),
        Number(size?.y ?? 1),
        Number(size?.z ?? 1),
      ]),
      rotations: new Float32Array([
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      ]),
      colors: null,
      solidColor: null,
    },
    entity
  );
}

function decodeSpherePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveSpherePrimitiveMessage,
  index: number
): Scene3dPrimitive {
  const position = primitive.pose?.position ?? null;
  const rotation = normalizeQuaternion(primitive.pose?.orientation);
  const size = primitive.size ?? null;

  return applySceneEntitySemantic(
    {
      kind: "sphere-list",
      id: `${entity.id}:sphere:${index}`,
      frameId: entity.frameId,
      positions: new Float32Array([
        Number(position?.x ?? 0),
        Number(position?.y ?? 0),
        Number(position?.z ?? 0),
      ]),
      scales: new Float32Array([
        Number(size?.x ?? 1),
        Number(size?.y ?? 1),
        Number(size?.z ?? 1),
      ]),
      rotations: new Float32Array([
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      ]),
      colors: null,
      solidColor: null,
    },
    entity
  );
}

function decodeLinePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveLinePrimitiveMessage,
  index: number
): Scene3dPrimitive | null {
  const { points } = decodeIndexedLinePoints(primitive);
  if (!points.length) {
    return null;
  }

  if ((primitive.type ?? LINE_TYPE_STRIP) === LINE_TYPE_LOOP) {
    points.push(points[0]);
  }

  const poseMatrix = createPoseMatrix(primitive.pose);
  const flattenedPoints = points.flat();

  return applySceneEntitySemantic(
    {
      kind:
        (primitive.type ?? LINE_TYPE_STRIP) === LINE_TYPE_LIST
          ? "line-list"
          : "line-strip",
      id: `${entity.id}:line:${index}`,
      frameId: entity.frameId,
      positions: transformPoints(flattenedPoints, poseMatrix),
      colors: null,
      solidColor: null,
    },
    entity
  );
}

function decodeEntityWarnings(entity: FoxgloveSceneEntityMessage) {
  const unsupportedKinds = [
    entity.cylinders?.length ? "cylinders" : null,
    entity.triangles?.length ? "triangles" : null,
    entity.texts?.length ? "texts" : null,
    entity.models?.length ? "models" : null,
  ].filter((value): value is string => Boolean(value));

  if (!unsupportedKinds.length) {
    return [];
  }

  return [
    `Skipped unsupported SceneUpdate primitives: ${unsupportedKinds.join(
      ", "
    )}`,
  ];
}

function decodeEntity(entity: FoxgloveSceneEntityMessage) {
  const timestampNs = decodeTimestampNs(entity.timestamp);
  if (timestampNs === null) {
    return null;
  }

  const lifetimeNs = decodeDurationNs(entity.lifetime);
  const entityId = entity.id ?? "";
  const frameId = entity.frameId ?? null;
  const metadataEntries = decodeMetadataEntries(entity);
  const semanticKey = getSceneEntitySemanticKey(
    entityId,
    frameId,
    metadataEntries
  );
  const decodedEntity: DecodedFoxgloveSceneEntityState = {
    frameId,
    id: entityId,
    timestampNs,
    expiresAtNs: lifetimeNs > 0 ? timestampNs + lifetimeNs : null,
    frameLocked: Boolean(entity.frameLocked),
    semantic: createSceneEntitySemantic(entityId, frameId, metadataEntries),
    semanticColor: getSceneEntitySemanticColor(semanticKey),
    primitives: [],
    warnings: decodeEntityWarnings(entity),
  };

  (entity.arrows ?? []).forEach((primitive, index) => {
    decodedEntity.primitives.push(
      decodeArrowPrimitive(decodedEntity, primitive, index)
    );
  });
  (entity.cubes ?? []).forEach((primitive, index) => {
    decodedEntity.primitives.push(
      decodeCubePrimitive(decodedEntity, primitive, index)
    );
  });
  (entity.spheres ?? []).forEach((primitive, index) => {
    decodedEntity.primitives.push(
      decodeSpherePrimitive(decodedEntity, primitive, index)
    );
  });
  (entity.lines ?? []).forEach((primitive, index) => {
    const decodedPrimitive = decodeLinePrimitive(
      decodedEntity,
      primitive,
      index
    );
    if (decodedPrimitive) {
      decodedEntity.primitives.push(decodedPrimitive);
    }
  });

  return decodedEntity;
}

export function decodeFoxgloveSceneUpdatePayload(
  payload: Uint8Array
): DecodedFoxgloveSceneUpdate {
  const message = decodeFoxgloveSceneUpdateMessage(payload);

  return {
    entities: (message.entities ?? [])
      .map((entity) => decodeEntity(entity))
      .filter((value): value is DecodedFoxgloveSceneEntityState =>
        Boolean(value)
      ),
    deletions: (message.deletions ?? [])
      .map((deletion) => {
        const timestampNs = decodeTimestampNs(deletion.timestamp);
        if (timestampNs === null) {
          return null;
        }

        return {
          id: deletion.id ?? "",
          timestampNs,
          type: deletion.type ?? 0,
        };
      })
      .filter((value): value is DecodedFoxgloveSceneDeletion => Boolean(value)),
  };
}
