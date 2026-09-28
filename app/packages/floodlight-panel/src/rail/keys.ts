/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

export type Orientation = "vertical" | "horizontal";

/**
 * Where a key moves the rail from `position`: arrows along the rail's axis
 * by 1%, Page Up/Down by 10%, Home/End to the ends. Undefined for other
 * keys.
 */
export const keyTarget = (
  key: string,
  position: number,
  orientation: Orientation,
): number | undefined => {
  const [back, forward] =
    orientation === "vertical"
      ? ["ArrowUp", "ArrowDown"]
      : ["ArrowLeft", "ArrowRight"];
  const steps: Record<string, number> = {
    [back]: -0.01,
    [forward]: 0.01,
    PageUp: -0.1,
    PageDown: 0.1,
  };
  if (key === "Home") return 0;
  if (key === "End") return 1;
  const step = steps[key];
  if (step === undefined) return undefined;
  return Math.min(Math.max(position + step, 0), 1);
};
