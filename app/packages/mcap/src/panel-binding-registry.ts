import type {
  MultimodalPanelArchetype,
  MultimodalStreamDescriptor,
} from "./types";

/** Returns whether the given stream can render inside the requested panel. */
export function canBindStreamToPanel(
  stream: Pick<MultimodalStreamDescriptor, "compatiblePanels">,
  archetype: MultimodalPanelArchetype
) {
  return stream.compatiblePanels.includes(archetype);
}

/** Returns whether the given stream is renderable in any built-in panel. */
export function isRenderableStream(
  stream: Pick<MultimodalStreamDescriptor, "compatiblePanels">
) {
  return (
    canBindStreamToPanel(stream, "image") || canBindStreamToPanel(stream, "3d")
  );
}

/** Returns whether the given stream can render inside a built-in image panel. */
export function isImageRenderableStream(
  stream: Pick<MultimodalStreamDescriptor, "compatiblePanels">
) {
  return canBindStreamToPanel(stream, "image");
}

/** Returns whether the given stream can render inside a built-in 3D panel. */
export function isScene3dRenderableStream(
  stream: Pick<MultimodalStreamDescriptor, "compatiblePanels">
) {
  return canBindStreamToPanel(stream, "3d");
}
