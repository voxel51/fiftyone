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
  SceneEntityVisualization,
  SceneLinePrimitive,
  ScenePoint3D,
  SceneSpherePrimitive,
  SceneUpdateVisualization,
} from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";

/**
 * One trajectory sample: pose position at a timeline time.
 */
export interface McapPoseTrajectoryPoint {
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
const POSE_MARKER_DIAMETER_M = 0.6;

/**
 * Uniform-stride decimation that always keeps the final point.
 */
export function decimateTrajectory(
  points: readonly McapPoseTrajectoryPoint[],
  maxPoints = TRAJECTORY_MAX_POINTS,
): readonly McapPoseTrajectoryPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) {
    return points;
  }

  const stride = (points.length - 1) / (maxPoints - 1);
  const decimated: McapPoseTrajectoryPoint[] = [];
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
  topic,
}: {
  readonly frameId: string;
  readonly points: readonly McapPoseTrajectoryPoint[];
  readonly topic: string;
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
        id: `trajectory:${topic}`,
        frameId,
        lines: [line],
      }),
    ],
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
}

/**
 * Current-pose marker as its own synthetic SceneUpdate so per-tick pose
 * motion never rebuilds the trajectory line geometry.
 */
export function poseMarkerSceneUpdate({
  frameId,
  pose,
  topic,
}: {
  readonly frameId: string;
  readonly pose: PoseVisualization;
  readonly topic: string;
}): SceneUpdateVisualization {
  const sphere: SceneSpherePrimitive = {
    color: TRAJECTORY_COLOR,
    pose: {
      position: pose.position,
      quaternion: pose.quaternion,
    },
    size: [
      POSE_MARKER_DIAMETER_M,
      POSE_MARKER_DIAMETER_M,
      POSE_MARKER_DIAMETER_M,
    ],
  };

  return {
    deletions: [],
    entities: [
      sceneEntity({
        id: `pose:${topic}`,
        frameId,
        spheres: [sphere],
      }),
    ],
    kind: VISUALIZATION_KIND.SCENE_UPDATE,
  };
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
  frameId,
  id,
  lines = [],
  spheres = [],
}: {
  readonly frameId: string;
  readonly id: string;
  readonly lines?: readonly SceneLinePrimitive[];
  readonly spheres?: readonly SceneSpherePrimitive[];
}): SceneEntityVisualization {
  return {
    arrowCount: 0,
    arrows: [],
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
    sphereCount: spheres.length,
    spheres,
    textCount: 0,
    texts: [],
    triangleCount: 0,
    triangles: [],
  };
}
