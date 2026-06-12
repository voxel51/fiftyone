/**
 * The retained-mode integration contract: a surface ships a
 * kind-agnostic {@link SurfaceBridge} plus a {@link LabelKindAdapter} per
 * label kind it renders; the engine derives the whole read-half.
 * Declarative (React) surfaces use selector hooks instead — no bridge.
 */

import type { LabelData, LabelType } from "@fiftyone/utilities";

import type { LabelRef, ScopedRef } from "../identity/ref";

export interface LabelKindAdapter<Handle, Descriptor> {
  /** engine → surface (create), PURE: build the construction spec for a new handle. */
  buildHandle(ref: LabelRef, label: LabelData): Descriptor;

  /** engine → surface (update): push a committed label onto an existing handle, SILENTLY. */
  updateHandle(handle: Handle, label: LabelData): void;

  /** surface → engine: pull the edited label out of a handle. No `_id` — the ref owns identity. */
  toLabel(handle: Handle): Partial<LabelData> | null;
}

export interface SurfaceBridge<Handle, Descriptor> {
  /** "lighter" | "looker-3d" | "timeline" — debug/telemetry identity. */
  surface: string;

  /**
   * Temporal posture: `frame-locked` renders the present subset (the
   * engine merges presence enter/exit/refresh into mount/unmount/update);
   * `pool` renders the whole pool (semantic changes only). Irrelevant when
   * non-temporal (presence ≡ pool). Default: `frame-locked`.
   */
  temporal?: "frame-locked" | "pool";

  /**
   * The sample this bridge projects (a Lighter scene shows one sample) —
   * REQUIRED. The loop filters every branch to it: the bridge boundary is
   * where full-tuple identity would otherwise degrade to instanceId
   * (`resolveHandle` is scene-side; scenes don't know samples), and absent
   * handles mean "create", not "skip". Multi-sample retained surfaces
   * need a wider contract (per-handle sample on `refOf`), deferred until one
   * appears; declarative surfaces already span samples without a bridge.
   */
  sample: string;

  /**
   * Partial-projection scope: when present, the loop filters every branch
   * to these label paths — identity scoping like {@link sample}, for
   * surfaces that project a subset of the sample (the annotate modal mounts
   * only the active schema fields). The set is fixed for the bridge's
   * lifetime: to change scope, register a new bridge (and `clear()` the old
   * one) — registration hydrates the new scope by reconcile.
   */
  paths?: ReadonlySet<string>;

  resolveHandle(ref: LabelRef): Handle | undefined;
  refOf(handle: Handle): ScopedRef;

  /**
   * Construct the surface-native object. Returns `undefined` when the kind
   * is async-sourced and the mount is gated on its source resolving — the
   * bridge inserts the handle itself when the source lands and reports it
   * via {@link onDeferredMount}. Gated bridges must dedupe in-flight mounts
   * and discard a resolve whose ref has since been deleted or reconciled
   * away.
   */
  mount(descriptor: Descriptor): Handle | undefined;

  unmount(handle: Handle): void;

  /**
   * Assigned by the read-half loop on registration. A bridge that gates
   * mounts invokes it when a deferred handle actually inserts, so the loop
   * can apply current interaction state (every mount path applies it).
   */
  onDeferredMount?: (handle: Handle) => void;

  /** Remove ALL handles (whole-sample reset). */
  clear(): void;

  /** Optional origin-suppression flag (perf/transitional). */
  isWriting?: boolean;

  // interaction read-half — SILENT visual application; omit if the
  // surface shows no selection/hover affordance
  applySelected?(handle: Handle, selected: boolean): void;
  applyHovered?(handle: Handle, hovered: boolean): void;
  applyAnchor?(handle: Handle, isAnchor: boolean): void;
}

export type AdapterMap<Handle, Descriptor> = Partial<
  Record<LabelType, LabelKindAdapter<Handle, Descriptor>>
>;
