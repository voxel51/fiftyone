/**
 * The annotation engine (spec: ANNOTATION_ENGINE_INTERFACE.md). Public
 * surface: the engine facade + the two integration shapes — retained-mode
 * (SurfaceBridge + adapters via useSurfaceBridge) and declarative (selector
 * hooks + SurfaceActions). Atoms stay module-private throughout.
 */

// identity
export type { LabelRef, ScopedRef } from "./identity/ref";
export { linkageKey, refKey, refsEqual, toLabelRef } from "./identity/ref";
export type { EntityId, EntityIdentity } from "./identity/entityId";
export {
  decodeEntityId,
  encodeEntityId,
  MalformedEntityIdError,
} from "./identity/entityId";

// stores
export type {
  ChangeListener,
  DisplayListener,
  LabelChange,
  LabelChangeKind,
  LabelStore,
} from "./store/types";
export { isWholeSampleReset, wholeSampleReset } from "./store/types";
export { SampleLabelStore } from "./store/sampleLabelStore";

// engine facade
export type { ScopedEngine } from "./core/engine";
export { AnnotationEngine } from "./core/engine";
export type { UndoEntry, UndoOp } from "./core/undoStack";

// interaction
export type { InteractionState } from "./interaction/interactionState";

// temporal
export type {
  Clock,
  PresenceEvent,
  PresenceListener,
  TemporalView,
} from "./temporal/types";

// retained-mode integration
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

// Lighter surface
export type { LighterDescriptor } from "./surfaces/lighter/adapters";
export { lighterAdapters } from "./surfaces/lighter/adapters";
export { createLighterBridge } from "./surfaces/lighter/lighterBridge";
export { useLighterEngineBridge } from "./surfaces/lighter/useLighterEngineBridge";

// declarative integration
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
