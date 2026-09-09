export const THUMB_DISPLAY = 36;

export const MAX_HEIGHT = 300;
export const ROW_HEIGHT = 52;
export const OVERSCAN = 5;

export const STATUS_PRIORITY: Record<string, number> = {
  uploading: 0,
  selected: 1,
  error: 2,
  cancelled: 3,
  success: 4,
};

export const STATUS_COLOR = {
  success: "success" as const,
  error: "error" as const,
  uploading: "primary" as const,
  selected: "inherit" as const,
  cancelled: "inherit" as const,
};
