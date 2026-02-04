import type { ReconciledDetection3D, ReconciledPolyline3D } from "../types";

/**
 *
 * Alias for label ID
 */
export type LabelId = string;

// =============================================================================
// WORKING STORE TYPES
// =============================================================================

/**
 * The working document that holds all committed edits during an annotation session.
 * This is the authoritative state for persistence.
 *
 * - Initialized from server baseline when entering annotate mode
 * - All committed edits flow here ("pointer-up" / transform-end events)
 * - Used to compute deltas against server baseline for persistence
 */
export interface WorkingDoc {
  /**
   * All labels indexed by their ID.
   * Contains both existing labels (from baseline sample) and newly created labels.
   */
  labelsById: Record<LabelId, ReconciledDetection3D | ReconciledPolyline3D>;

  /**
   * Set of label IDs that have been deleted during this session.
   * Used to generate delete operations when persisting.
   */
  deletedIds: Set<LabelId>;
}

/**
 * State of the working store for a single sample.
 */
export interface WorkingState {
  /**
   * The working document containing all labels.
   */
  doc: WorkingDoc;

  /**
   * Whether the working store has been initialized from baseline sample.
   */
  initialized: boolean;
}

// =============================================================================
// TRANSIENT STORE TYPES
// =============================================================================

/**
 * Transient state for a cuboid during manipulation (drag/rotate/scale).
 * These are ephemeral values that are NOT persisted.
 */
export interface TransientCuboidState {
  /**
   * Position delta being applied during drag.
   * Added to the working store position during render.
   */
  positionDelta?: [number, number, number];

  /**
   * Dimensions delta being applied during scale.
   * Multiplied with the working store dimensions during render.
   */
  dimensionsDelta?: [number, number, number];

  /**
   * Quaternion override during rotation.
   * Replaces the working store quaternion during render.
   */
  quaternionOverride?: [number, number, number, number];
}

/**
 * Transient state for a polyline during manipulation.
 * These are ephemeral values that are NOT persisted.
 */
export interface TransientPolylineState {
  /**
   * Position delta being applied during centroid drag.
   * Added to all vertices during render.
   */
  positionDelta?: [number, number, number];

  /**
   * Individual vertex position overrides during vertex drag.
   * Key format: `${segmentIndex}-${pointIndex}`
   * Value is the delta to add to the vertex position.
   */
  vertexDeltas?: Record<string, [number, number, number]>;
}

/**
 * The transient store holds ephemeral interaction state.
 * - Stores drag deltas, hover states, snapping previews
 * - NOT persisted
 * - Cleared on pointer-up after committing to working store
 */
export interface TransientStore {
  /**
   * Transient state for cuboids being manipulated.
   */
  cuboids: Record<LabelId, TransientCuboidState>;

  /**
   * Transient state for polylines being manipulated.
   */
  polylines: Record<LabelId, TransientPolylineState>;

  /**
   * The label ID currently being dragged, or null if no drag is in progress.
   */
  activeDragLabel: LabelId | null;
}

// =============================================================================
// RENDER MODEL TYPES
// =============================================================================

/**
 * The render model is the computed state used for rendering.
 * It combines working store state with transient overlay.
 *
 * renderModel = derive(working.doc, transient)
 */
export interface RenderModel {
  detections: ReconciledDetection3D[];
  polylines: ReconciledPolyline3D[];
}
