/**
 * Pure helpers for rendering ego-pose streams: trajectory decimation, the
 * synthetic SceneUpdate payloads that reuse the existing 3D annotation
 * pipeline (line rendering + frame-locked transform resolution), and the
 * frame heuristics/telemetry formatting around them.
 */
import type {
  LocationVisualization,
  PoseVisualization,
  RgbaColor,
  SceneArrowPrimitive,
  SceneEntityVisualization,
  SceneLinePrimitive,
  ScenePoint3D,
  SceneUpdateVisualization,
} from "../../../../ir/index";
import { VISUALIZATION_KIND } from "../../../../visualization/index";

/**
 * One trajectory sample: pose position at a timeline time.
 */
export interface EpisodePoseTrajectoryPoint {
  readonly position: ScenePoint3D;
  readonly timeNs: bigint;
}

/**
 * Cap on rendered trajectory vertices. High-rate odometry (50Hz over
 * minutes) decimates to this bound; the last sample always survives so
 * the path reaches the newest pose.
 */
export const TRAJECTORY_MAX_POINTS = 5_000;

// Amber, matching the camera-frustum accent so ego artifacts read as one
// family; distinct from the cyan annotation default.
const TRAJECTORY_COLOR: RgbaColor = [1, 0.67, 0.2, 1];
const TRAJECTORY_THICKNESS = 2;

type Quaternion = readonly [number, number, number, number];

// RGB axes triad — the RViz/Foxglove idiom for a pose. Each arrow points
// along +X of its own pose, so Y and Z get a fixed rotation composed onto
// the pose orientation.
const POSE_AXIS_SHAFT_LENGTH_M = 0.25;
const POSE_AXIS_SHAFT_DIAMETER_M = 0.06;
const POSE_AXIS_HEAD_LENGTH_M = 0.1;
const POSE_AXIS_HEAD_DIAMETER_M = 0.14;

const X_TO_Y_QUATERNION: Quaternion = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
const X_TO_Z_QUATERNION: Quaternion = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];

const POSE_AXES: ReadonlyArray<{
  readonly axisQuaternion: Quaternion;
  readonly color: RgbaColor;
}> = [
  { axisQuaternion: [0, 0, 0, 1], color: [0.92, 0.25, 0.25, 1] },
  { axisQuaternion: X_TO_Y_QUATERNION, color: [0.3, 0.82, 0.3, 1] },
  { axisQuaternion: X_TO_Z_QUATERNION, color: [0.3, 0.5, 1, 1] },
];

/**
 * Uniform-stride decimation that always keeps the final point.
 */
export function decimateTrajectory(
  points: readonly EpisodePoseTrajectoryPoint[],
  maxPoints = TRAJECTORY_MAX_POINTS,
): readonly EpisodePoseTrajectoryPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) {
    return points;
  }

  const stride = (points.length - 1) / (maxPoints - 1);
  const decimated: EpisodePoseTrajectoryPoint[] = [];
  for (let index = 0; index < maxPoints - 1; index++) {
    decimated.push(points[Math.round(index * stride)]);
  }
  decimated.push(points[points.length - 1]);

  return decimated;
}

/**
 * Default frame for pose streams that declare none (JSON odometry
 * exports): prefer a global frame from the transform graph by name, else
 * empty (render unframed at the scene origin).
 */
export function defaultTrajectoryFrame(frameIds: readonly string[]): string {
  for (const candidate of ["map", "world", "odom", "earth"]) {
    if (frameIds.includes(candidate)) {
      return candidate;
    }
  }

  return "";
}

/**
 * Full-history trajectory as a synthetic frame-locked SceneUpdate with one
 * line-strip entity, ready for the existing 3D annotation layer path.
 */
export function trajectorySceneUpdate({
  frameId,
  points,
  stream,
}: {
  readonly frameId: string;
  readonly points: readonly EpisodePoseTrajectoryPoint[];
  readonly stream: string;
}): SceneUpdateVisualization {
  const line: SceneLinePrimitive = {
    color: TRAJECTORY_COLOR,
    colors: [],
    indices: [],
    points: points.map((point) => point.position),
    pose: {
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
    },
    scaleInvariant: false,
    thickness: TRAJECTORY_THICKNESS,
    type: "line-strip",
  };

  return {
    deletions: [],
    entities: [
      sceneEntity({
        id: `trajectory:${stream}`,
        frameId,
        lines: [line],
      }),
    ],
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
}

/**
 * Current-pose marker as its own synthetic SceneUpdate so per-tick pose
 * motion never rebuilds the trajectory line geometry. Rendered as an RGB
 * axes triad so the pose orientation is visible.
 */
export function poseMarkerSceneUpdate({
  frameId,
  pose,
  stream,
}: {
  readonly frameId: string;
  readonly pose: PoseVisualization;
  readonly stream: string;
}): SceneUpdateVisualization {
  const arrows: SceneArrowPrimitive[] = POSE_AXES.map(
    ({ axisQuaternion, color }) => ({
      color,
      headDiameter: POSE_AXIS_HEAD_DIAMETER_M,
      headLength: POSE_AXIS_HEAD_LENGTH_M,
      pose: {
        position: pose.position,
        quaternion: multiplyQuaternions(pose.quaternion, axisQuaternion),
      },
      shaftDiameter: POSE_AXIS_SHAFT_DIAMETER_M,
      shaftLength: POSE_AXIS_SHAFT_LENGTH_M,
    }),
  );

  return {
    deletions: [],
    entities: [
      sceneEntity({
        id: `pose:${stream}`,
        frameId,
        arrows,
      }),
    ],
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
}

function multiplyQuaternions(a: Quaternion, b: Quaternion): Quaternion {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * HUD line for the first pose stream carrying velocity, e.g. "6.5 m/s".
 */
export function speedHudLine(
  velocity: readonly [number, number, number] | undefined,
): string | null {
  if (!velocity || velocity.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return `${Math.hypot(...velocity).toFixed(1)} m/s`;
}

/**
 * HUD line for a geographic fix, e.g. "42.34921, -71.04576" (five decimal
 * places ≈ 1m of precision).
 */
export function locationHudLine(
  location: Pick<LocationVisualization, "latitude" | "longitude"> | undefined,
): string | null {
  if (
    !location ||
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude)
  ) {
    return null;
  }

  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

function sceneEntity({
  arrows = [],
  frameId,
  id,
  lines = [],
}: {
  readonly arrows?: readonly SceneArrowPrimitive[];
  readonly frameId: string;
  readonly id: string;
  readonly lines?: readonly SceneLinePrimitive[];
}): SceneEntityVisualization {
  return {
    arrowCount: arrows.length,
    arrows,
    cubeCount: 0,
    cubes: [],
    cylinderCount: 0,
    cylinders: [],
    ...(frameId ? { frameId } : {}),
    // Frame-locked: a trajectory/pose in a global frame must track the
    // world frame at the playhead, exactly like grid map layers.
    frameLocked: true,
    id,
    lineCount: lines.length,
    lines,
    metadata: {},
    modelCount: 0,
    models: [],
    sphereCount: 0,
    spheres: [],
    textCount: 0,
    texts: [],
    triangleCount: 0,
    triangles: [],
  };
}
