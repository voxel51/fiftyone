/**
 * Adds the hovered point source to an image pane's projection inputs without
 * enabling its full point-cloud overlay. This lets a calibrated pane render a
 * one-point correspondence marker while keeping ordinary projection settings
 * and picking unchanged.
 */
export function projectionStreamsForHover(
  renderedStreams: readonly string[],
  availableStreams: readonly string[],
  hoveredStream: string | null,
): readonly string[] {
  if (
    !hoveredStream ||
    !availableStreams.includes(hoveredStream) ||
    renderedStreams.includes(hoveredStream)
  ) {
    return renderedStreams;
  }
  return [...renderedStreams, hoveredStream];
}
