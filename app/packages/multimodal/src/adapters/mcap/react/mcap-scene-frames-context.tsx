import type {
  McapReferenceSelectionSource,
  McapReferenceTransition,
} from "./mcap-3d-reference-selection";
import { createMcapTileRegistry } from "./mcap-tile-registry";

/**
 * Reference-frame controls a mounted 3D tile publishes for the scene at large.
 *
 * The reference frame is scene-scoped: every 3D view renders the same world, and
 * the selection writes through to the modal-wide preferred-world-frame
 * setting, so concurrent 3D tiles converge on one choice. The *state* still
 * materializes inside a 3D tile (frame availability streams in with that
 * tile's data), so the tile registers its controls here and scene-level
 * chrome — the sidebar's Scene tab — edits them without reaching into tile
 * internals.
 */
export interface McapSceneFrameControls {
  readonly activeComponentFrameIds: readonly string[];
  /** Stable first-registered authority; focus changes do not change it. */
  readonly authorityTileId: string;
  /** Every frame id known to the transform graph and streamed data. */
  readonly frameIds: readonly string[];
  readonly omittedFrameIds: readonly string[];
  readonly omittedSourceIds: readonly string[];
  readonly referenceTransition: McapReferenceTransition | null;
  readonly updateWorldFrameId: (frameId: string) => void;
  readonly useRecommendedWorldFrame: () => void;
  readonly worldFrameId: string;
  readonly worldFrameSelectionSource: McapReferenceSelectionSource;
}

const registry =
  createMcapTileRegistry<McapSceneFrameControls>("McapSceneFrames");

/** Modal-scoped registry of the 3D tiles' scene frame controls. */
export const McapSceneFramesProvider = registry.Provider;

/** Publishes a 3D tile's frame controls for the tile's mounted lifetime. */
export const useRegisterMcapSceneFrameControls = registry.useRegister;

/**
 * The scene's frame controls, from the first mounted 3D tile — or null when
 * no 3D view exists to give the reference frame meaning.
 */
export function useMcapSceneFrameControls(): McapSceneFrameControls | null {
  return registry.usePrimary();
}
