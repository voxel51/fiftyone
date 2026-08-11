/** Width and height consumed and returned by image-fit calculations. */
export interface ImageFitSize {
  readonly height: number;
  readonly width: number;
}

/** Fits content by one axis using contain or cover aspect-ratio semantics. */
export function fittedImageSize(
  container: ImageFitSize,
  content: ImageFitSize,
  fit: "contain" | "cover",
): ImageFitSize {
  const containerAspect = container.width / Math.max(1, container.height);
  const contentAspect = content.width / Math.max(1, content.height);
  const contentIsWider = contentAspect > containerAspect;
  const constrainByWidth = fit === "contain" ? contentIsWider : !contentIsWider;

  return constrainByWidth
    ? { height: container.width / contentAspect, width: container.width }
    : { height: container.height, width: container.height * contentAspect };
}
