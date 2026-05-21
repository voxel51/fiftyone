import type {
  McapComposedFrameTransform,
  McapQuaternion,
  McapStaticTransform,
  McapStaticTransformGraph,
  McapVector3,
} from "./types";

const GLOBAL_FIXED_FRAME_PREFERENCE = ["map", "odom", "world"] as const;
const EGO_FIXED_FRAME_PREFERENCE = [
  "base_link",
  "ego_vehicle",
  "ego",
  "vehicle",
] as const;
const FIXED_FRAME_PREFERENCE = [
  ...GLOBAL_FIXED_FRAME_PREFERENCE,
  ...EGO_FIXED_FRAME_PREFERENCE,
] as const;
const IDENTITY_QUATERNION: McapQuaternion = Object.freeze({
  w: 1,
  x: 0,
  y: 0,
  z: 0,
});
const ZERO_VECTOR: McapVector3 = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * Creates a deterministic static transform graph from normalized transforms.
 */
export function createMcapStaticTransformGraph({
  diagnostics = [],
  transforms,
}: {
  readonly diagnostics?: readonly string[];
  readonly transforms: readonly McapStaticTransform[];
}): McapStaticTransformGraph {
  const frameIds = [...frameIdSet(transforms)].sort(compareFrameIds);

  return {
    diagnostics,
    frameIds,
    transforms,
  };
}

/**
 * Selects the fixed frame a 3D panel should render into.
 */
export function selectMcapFixedFrame({
  explicitFrameId,
  graph,
  sourceFrameIds,
}: {
  readonly explicitFrameId?: string;
  readonly graph: McapStaticTransformGraph;
  readonly sourceFrameIds: readonly string[];
}): string | undefined {
  const explicit = cleanFrameId(explicitFrameId);
  if (explicit) {
    return explicit;
  }

  const sourceFrames = sourceFrameIds.map(cleanFrameId).filter(isPresent);
  const candidates =
    sourceFrames.length > 0
      ? framesConnectedToAnySource(graph, sourceFrames)
      : new Set(graph.frameIds);

  for (const preferred of FIXED_FRAME_PREFERENCE) {
    const frameId = findPreferredFrame(candidates, preferred);
    if (frameId) {
      return frameId;
    }
  }

  return undefined;
}

/**
 * Resolves a composed transform between two frames using only static edges.
 */
export function resolveMcapStaticFrameTransform({
  graph,
  sourceFrameId,
  targetFrameId,
}: {
  readonly graph: McapStaticTransformGraph;
  readonly sourceFrameId: string;
  readonly targetFrameId: string;
}): McapComposedFrameTransform | null {
  const source = cleanFrameId(sourceFrameId);
  const target = cleanFrameId(targetFrameId);
  if (!source || !target) {
    return null;
  }

  if (source === target) {
    return {
      rotation: IDENTITY_QUATERNION,
      sourceFrameId: source,
      targetFrameId: target,
      translation: ZERO_VECTOR,
    };
  }

  const adjacency = buildAdjacency(graph.transforms);
  const queue: McapComposedFrameTransform[] = [
    {
      rotation: IDENTITY_QUATERNION,
      sourceFrameId: source,
      targetFrameId: source,
      translation: ZERO_VECTOR,
    },
  ];
  const visited = new Set([source]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) {
      continue;
    }

    const edges = adjacency.get(current.targetFrameId) ?? [];
    for (const edge of edges) {
      if (visited.has(edge.targetFrameId)) {
        continue;
      }

      const composed = composeFrameTransforms(current, edge);
      if (composed.targetFrameId === target) {
        return {
          ...composed,
          sourceFrameId: source,
          targetFrameId: target,
        };
      }

      visited.add(edge.targetFrameId);
      queue.push(composed);
    }
  }

  return null;
}

function frameIdSet(transforms: readonly McapStaticTransform[]) {
  const frameIds = new Set<string>();
  for (const transform of transforms) {
    frameIds.add(transform.parentFrameId);
    frameIds.add(transform.childFrameId);
  }
  return frameIds;
}

function framesConnectedToAnySource(
  graph: McapStaticTransformGraph,
  sourceFrameIds: readonly string[]
): Set<string> {
  const adjacency = buildFrameAdjacency(graph.transforms);
  const connected = new Set<string>();
  const queue = [...sourceFrameIds];

  for (const sourceFrameId of sourceFrameIds) {
    connected.add(sourceFrameId);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const frameId = queue[index];
    if (!frameId) {
      continue;
    }

    for (const nextFrameId of adjacency.get(frameId) ?? []) {
      if (connected.has(nextFrameId)) {
        continue;
      }

      connected.add(nextFrameId);
      queue.push(nextFrameId);
    }
  }

  return connected;
}

function buildFrameAdjacency(transforms: readonly McapStaticTransform[]) {
  const adjacency = new Map<string, string[]>();
  for (const transform of transforms) {
    pushAdjacency(adjacency, transform.childFrameId, transform.parentFrameId);
    pushAdjacency(adjacency, transform.parentFrameId, transform.childFrameId);
  }
  return adjacency;
}

function buildAdjacency(transforms: readonly McapStaticTransform[]) {
  const adjacency = new Map<string, McapComposedFrameTransform[]>();
  for (const transform of transforms) {
    pushAdjacency(adjacency, transform.childFrameId, {
      rotation: transform.rotation,
      sourceFrameId: transform.childFrameId,
      targetFrameId: transform.parentFrameId,
      translation: transform.translation,
    });
    pushAdjacency(
      adjacency,
      transform.parentFrameId,
      invertFrameTransform({
        rotation: transform.rotation,
        sourceFrameId: transform.childFrameId,
        targetFrameId: transform.parentFrameId,
        translation: transform.translation,
      })
    );
  }
  return adjacency;
}

function pushAdjacency<Value>(
  adjacency: Map<string, Value[]>,
  frameId: string,
  value: Value
) {
  const values = adjacency.get(frameId);
  if (values) {
    values.push(value);
  } else {
    adjacency.set(frameId, [value]);
  }
}

function composeFrameTransforms(
  first: McapComposedFrameTransform,
  second: McapComposedFrameTransform
): McapComposedFrameTransform {
  return {
    rotation: multiplyQuaternions(second.rotation, first.rotation),
    sourceFrameId: first.sourceFrameId,
    targetFrameId: second.targetFrameId,
    translation: addVectors(
      rotateVector(second.rotation, first.translation),
      second.translation
    ),
  };
}

function invertFrameTransform(
  transform: McapComposedFrameTransform
): McapComposedFrameTransform {
  const inverseRotation = invertQuaternion(transform.rotation);

  return {
    rotation: inverseRotation,
    sourceFrameId: transform.targetFrameId,
    targetFrameId: transform.sourceFrameId,
    translation: rotateVector(
      inverseRotation,
      negateVector(transform.translation)
    ),
  };
}

function multiplyQuaternions(
  left: McapQuaternion,
  right: McapQuaternion
): McapQuaternion {
  return normalizeQuaternion({
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  });
}

function invertQuaternion(quaternion: McapQuaternion): McapQuaternion {
  const lengthSquared =
    quaternion.w * quaternion.w +
    quaternion.x * quaternion.x +
    quaternion.y * quaternion.y +
    quaternion.z * quaternion.z;
  if (lengthSquared === 0) {
    return IDENTITY_QUATERNION;
  }

  return {
    w: quaternion.w / lengthSquared,
    x: -quaternion.x / lengthSquared,
    y: -quaternion.y / lengthSquared,
    z: -quaternion.z / lengthSquared,
  };
}

function normalizeQuaternion(quaternion: McapQuaternion): McapQuaternion {
  const length = Math.hypot(
    quaternion.w,
    quaternion.x,
    quaternion.y,
    quaternion.z
  );
  if (length === 0) {
    return IDENTITY_QUATERNION;
  }

  return {
    w: quaternion.w / length,
    x: quaternion.x / length,
    y: quaternion.y / length,
    z: quaternion.z / length,
  };
}

function rotateVector(
  quaternion: McapQuaternion,
  vector: McapVector3
): McapVector3 {
  const normalized = normalizeQuaternion(quaternion);
  const ix =
    normalized.w * vector.x + normalized.y * vector.z - normalized.z * vector.y;
  const iy =
    normalized.w * vector.y + normalized.z * vector.x - normalized.x * vector.z;
  const iz =
    normalized.w * vector.z + normalized.x * vector.y - normalized.y * vector.x;
  const iw =
    -normalized.x * vector.x -
    normalized.y * vector.y -
    normalized.z * vector.z;

  return {
    x:
      ix * normalized.w +
      iw * -normalized.x +
      iy * -normalized.z -
      iz * -normalized.y,
    y:
      iy * normalized.w +
      iw * -normalized.y +
      iz * -normalized.x -
      ix * -normalized.z,
    z:
      iz * normalized.w +
      iw * -normalized.z +
      ix * -normalized.y -
      iy * -normalized.x,
  };
}

function addVectors(left: McapVector3, right: McapVector3): McapVector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function negateVector(vector: McapVector3): McapVector3 {
  return {
    x: -vector.x,
    y: -vector.y,
    z: -vector.z,
  };
}

function findPreferredFrame(
  frameIds: ReadonlySet<string>,
  preferredFrameId: string
) {
  for (const frameId of frameIds) {
    if (canonicalFrameId(frameId) === preferredFrameId) {
      return frameId;
    }
  }

  return undefined;
}

function canonicalFrameId(frameId: string) {
  return frameId.replace(/^\/+/, "").toLowerCase();
}

function cleanFrameId(frameId: string | undefined) {
  const trimmed = frameId?.trim();
  return trimmed ? trimmed : undefined;
}

function compareFrameIds(left: string, right: string) {
  return left.localeCompare(right);
}

function isPresent<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}
