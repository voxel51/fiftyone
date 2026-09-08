/** Maps a source image pixel into the displayed image's pixel space. */
export type ImagePixelTransform = (
  u: number,
  v: number,
) => readonly [number, number] | null;
