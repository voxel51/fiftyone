import * as THREE from "three";
import type { Scene3dPrimitive } from "./archetypes";
import { foxgloveColorToCss, foxgloveColorToRgbaArray } from "./foxglove-color";
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

export type DecodedFoxgloveSceneEntityState = {
  frameId: string | null;
  id: string;
  timestampNs: number;
  expiresAtNs: number | null;
  frameLocked: boolean;
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

function toLineColorArray(colors: Array<unknown> | null | undefined) {
  if (!colors?.length) {
    return null;
  }

  const values = new Float32Array(colors.length * 3);
  colors.forEach((color, index) => {
    const [r, g, b] = foxgloveColorToRgbaArray(color as never);
    const offset = index * 3;
    values[offset] = r;
    values[offset + 1] = g;
    values[offset + 2] = b;
  });

  return values;
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

  return {
    kind: "line-list",
    id: `${entity.id}:arrow:${index}`,
    frameId: entity.frameId,
    positions,
    colors: null,
    solidColor: foxgloveColorToCss(primitive.color, "rgba(255, 122, 89, 1)"),
  };
}

function decodeCubePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveCubePrimitiveMessage,
  index: number
): Scene3dPrimitive {
  const position = primitive.pose?.position ?? null;
  const rotation = normalizeQuaternion(primitive.pose?.orientation);
  const size = primitive.size ?? null;

  return {
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
    solidColor: foxgloveColorToCss(primitive.color, "rgba(255, 207, 90, 0.92)"),
  };
}

function decodeSpherePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveSpherePrimitiveMessage,
  index: number
): Scene3dPrimitive {
  const position = primitive.pose?.position ?? null;
  const rotation = normalizeQuaternion(primitive.pose?.orientation);
  const size = primitive.size ?? null;

  return {
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
    solidColor: foxgloveColorToCss(primitive.color, "rgba(94, 194, 255, 0.9)"),
  };
}

function decodeLinePrimitive(
  entity: DecodedFoxgloveSceneEntityState,
  primitive: FoxgloveLinePrimitiveMessage,
  index: number
): Scene3dPrimitive | null {
  const { points, colors } = decodeIndexedLinePoints(primitive);
  if (!points.length) {
    return null;
  }

  if ((primitive.type ?? LINE_TYPE_STRIP) === LINE_TYPE_LOOP) {
    points.push(points[0]);
    if (colors.length) {
      colors.push(colors[0]);
    }
  }

  const poseMatrix = createPoseMatrix(primitive.pose);
  const flattenedPoints = points.flat();
  const colorArray =
    colors.length === points.length ? toLineColorArray(colors) : null;

  return {
    kind:
      (primitive.type ?? LINE_TYPE_STRIP) === LINE_TYPE_LIST
        ? "line-list"
        : "line-strip",
    id: `${entity.id}:line:${index}`,
    frameId: entity.frameId,
    positions: transformPoints(flattenedPoints, poseMatrix),
    colors: colorArray,
    solidColor: colorArray
      ? null
      : foxgloveColorToCss(primitive.color, "rgba(149, 223, 114, 1)"),
  };
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
  const decodedEntity: DecodedFoxgloveSceneEntityState = {
    frameId: entity.frameId ?? null,
    id: entity.id ?? "",
    timestampNs,
    expiresAtNs: lifetimeNs > 0 ? timestampNs + lifetimeNs : null,
    frameLocked: Boolean(entity.frameLocked),
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
