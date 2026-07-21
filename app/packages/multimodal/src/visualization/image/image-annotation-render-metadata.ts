export type ImageAnnotationPoint2 = readonly [number, number];

export interface ImageAnnotationBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Render-ready LINE_LIST group prepared alongside interpolated geometry. */
export interface ImageAnnotationLineListGroup {
  readonly bounds: ImageAnnotationBounds;
  readonly label: string | null;
  readonly points: readonly ImageAnnotationPoint2[];
  readonly segments: readonly (readonly [
    ImageAnnotationPoint2,
    ImageAnnotationPoint2,
  ])[];
}

/** Per-points-primitive metadata; non-LINE_LIST entries are null. */
export interface ImageAnnotationRenderMetadata {
  readonly lineListGroups: readonly (
    | readonly ImageAnnotationLineListGroup[]
    | null
  )[];
}
