export type Scene3dUpAxis = "x" | "y" | "z";

export const DEFAULT_SCENE_3D_UP_AXIS: Scene3dUpAxis = "z";

export const SCENE_3D_UP_AXES: readonly Scene3dUpAxis[] = ["x", "y", "z"];

export type Scene3dTrackingMode = "free" | "position" | "heading" | "pose";
export type Scene3dFollowTrackingMode = Exclude<Scene3dTrackingMode, "free">;

export function normalizeScene3dUpAxis(
  value: unknown,
): Scene3dUpAxis | undefined {
  return value === "x" || value === "y" || value === "z" ? value : undefined;
}
