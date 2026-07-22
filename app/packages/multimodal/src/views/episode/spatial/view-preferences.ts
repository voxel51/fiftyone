export type Episode3dSceneUpAxis = "x" | "y" | "z";

export const DEFAULT_EPISODE_3D_SCENE_UP_AXIS: Episode3dSceneUpAxis = "z";

export const EPISODE_3D_SCENE_UP_AXES: readonly Episode3dSceneUpAxis[] = [
  "x",
  "y",
  "z",
];

export type Episode3dTrackingMode = "free" | "position" | "heading" | "pose";
export type Episode3dFollowTrackingMode = Exclude<
  Episode3dTrackingMode,
  "free"
>;

export function normalizeEpisode3dSceneUpAxis(
  value: unknown,
): Episode3dSceneUpAxis | undefined {
  return value === "x" || value === "y" || value === "z" ? value : undefined;
}
