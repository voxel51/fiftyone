export type Mcap3dSceneUpAxis = "x" | "y" | "z";

export const DEFAULT_MCAP_3D_SCENE_UP_AXIS: Mcap3dSceneUpAxis = "z";

export const MCAP_3D_SCENE_UP_AXES: readonly Mcap3dSceneUpAxis[] = [
  "x",
  "y",
  "z",
];

export function normalizeMcap3dSceneUpAxis(
  value: unknown,
): Mcap3dSceneUpAxis | undefined {
  return value === "x" || value === "y" || value === "z" ? value : undefined;
}
