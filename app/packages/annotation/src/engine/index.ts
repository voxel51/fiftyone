/**
 * The annotation engine (spec: ANNOTATION_ENGINE_INTERFACE.md). Public
 * surface: the engine facade + the two integration shapes — retained-mode
 * (SurfaceBridge + adapters via useSurfaceBridge) and declarative (selector
 * hooks + SurfaceActions). Atoms stay module-private throughout.
 */

// identity (§2)
export type { LabelRef, ScopedRef } from "./identity/ref";
export { linkageKey, refKey, refsEqual, toLabelRef } from "./identity/ref";
export type { EntityId, EntityIdentity } from "./identity/entityId";
export {
  decodeEntityId,
  encodeEntityId,
  MalformedEntityIdError,
} from "./identity/entityId";

// stores (§3/§4)
export type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelChangeKind,
  LabelStore,
} from "./store/types";
export { isWholeSampleReset, wholeSampleReset } from "./store/types";
export { SampleLabelStore } from "./store/sampleLabelStore";

// engine facade (§5)
export type { ScopedEngine } from "./core/engine";
export { AnnotationEngine } from "./core/engine";
export type { UndoEntry, UndoOp } from "./core/undoStack";

// interaction (§6.5)
export type { InteractionState } from "./interaction/interactionState";

// temporal (§4.1)
export type {
  Clock,
  PresenceEvent,
  PresenceListener,
  TemporalView,
} from "./temporal/types";

// retained-mode integration (§6 / D4)
export type {
  AdapterMap,
  LabelKindAdapter,
  SurfaceBridge,
} from "./bridge/types";
export type {
  SurfaceActions,
  SurfaceController,
} from "./bridge/surfaceController";
export {
  createSurfaceActions,
  createSurfaceController,
} from "./bridge/surfaceController";
export { useSurfaceBridge } from "./react/useSurfaceBridge";

// declarative integration (§6.6 / D6)
export type {
  EngineReads,
  Equals,
  InteractionReads,
  TemporalReads,
} from "./react/hooks";
export {
  useEngineSelector,
  useInteraction,
  useSurfaceActions,
  useTemporal,
} from "./react/hooks";
