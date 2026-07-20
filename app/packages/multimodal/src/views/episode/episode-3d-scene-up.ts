export type Episode3dSceneUpAxis = "x" | "y" | "z";

export const DEFAULT_EPISODE_3D_SCENE_UP_AXIS: Episode3dSceneUpAxis = "z";

export const EPISODE_3D_SCENE_UP_AXES: readonly Episode3dSceneUpAxis[] = [
  "x",
  "y",
  "z",
];

export function normalizeEpisode3dSceneUpAxis(
  value: unknown,
): Episode3dSceneUpAxis | undefined {
  return value === "x" || value === "y" || value === "z" ? value : undefined;
}
