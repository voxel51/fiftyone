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
  /** Optional renderer color for synthesized groups. */
  readonly color?: string;
  /** Optional source-stable identity for synthesized groups. */
  readonly key?: string;
  readonly label: string | null;
  readonly points: readonly ImageAnnotationPoint2[];
  /** Source scene entity for bidirectional 2D/3D hover correspondence. */
  readonly sceneEntityId?: string;
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
