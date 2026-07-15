export function detection2DRecord({
  classId,
  id,
  score,
  x,
  y,
}: {
  readonly classId: string;
  readonly id: string;
  readonly score: number;
  readonly x: number;
  readonly y: number;
}) {
  return {
    bbox: {
      center: {
        position: { x, y },
        theta: 0,
      },
      size_x: 20,
      size_y: 20,
    },
    id,
    results: [detectionResult(classId, score)],
  };
}

export function detection3DRecord({
  classId,
  id,
  score,
}: {
  readonly classId: string;
  readonly id: string;
  readonly score: number;
}) {
  return {
    bbox: {
      center: poseRecord([1, 2, 3], [0, 0, 0, 1]),
      size: vectorRecord([2, 1, 1.5]),
    },
    id,
    results: [detectionResult(classId, score)],
  };
}

export function detectionResult(classId: string, score: number) {
  return {
    hypothesis: {
      class_id: classId,
      score,
    },
  };
}

export function poseRecord(
  position: readonly [number, number, number],
  quaternion: readonly [number, number, number, number],
) {
  return {
    orientation: {
      w: quaternion[3],
      x: quaternion[0],
      y: quaternion[1],
      z: quaternion[2],
    },
    position: vectorRecord(position),
  };
}

export function vectorRecord(vector: readonly [number, number, number]) {
  return {
    x: vector[0],
    y: vector[1],
    z: vector[2],
  };
}
