/**
 * The retained-mode integration contract (spec §6 / D4): a surface ships a
 * kind-agnostic {@link SurfaceBridge} plus a {@link LabelKindAdapter} per
 * label kind it renders; the engine derives the whole read-half (§6.1).
 * Declarative (React) surfaces use selector hooks instead — no bridge (§6.6).
 */

import type { LabelData, LabelType } from "@fiftyone/utilities";

import type { LabelRef, ScopedRef } from "../identity/ref";

export interface LabelKindAdapter<Handle, Descriptor> {
  /** engine → surface (create), PURE: build the construction spec for a new handle. */
  buildHandle(ref: LabelRef, label: LabelData): Descriptor;

  /** engine → surface (update): push a committed label onto an existing handle, SILENTLY (§6.3). */
  updateHandle(handle: Handle, label: LabelData): void;

  /** surface → engine: pull the edited label out of a handle. No `_id` — the ref owns identity. */
  toLabel(handle: Handle): Partial<LabelData> | null;
}

export interface SurfaceBridge<Handle, Descriptor> {
  /** "lighter" | "looker-3d" | "timeline" — debug/telemetry identity. */
  surface: string;

  /**
   * Temporal posture (§4.1): `frame-locked` renders the present subset (the
   * engine merges presence enter/exit/refresh into mount/unmount/update);
   * `pool` renders the whole pool (semantic changes only). Irrelevant when
   * non-temporal (presence ≡ pool). Default: `frame-locked`.
   */
  temporal?: "frame-locked" | "pool";

  /**
   * Bind the bridge to one sample (a Lighter scene shows one sample); the
   * engine filters the change stream to it. Omit for cross-sample surfaces.
   */
  sample?: string;

  resolveHandle(ref: LabelRef): Handle | undefined;
  refOf(handle: Handle): ScopedRef;
  mount(descriptor: Descriptor): Handle;
  unmount(handle: Handle): void;

  /** Remove ALL handles (whole-sample reset, §6.1). */
  clear(): void;

  /** Optional origin-suppression flag (perf/transitional, §6.3). */
  isWriting?: boolean;

  // interaction read-half (§6.5) — SILENT visual application; omit if the
  // surface shows no selection/hover affordance
  applySelected?(handle: Handle, selected: boolean): void;
  applyHovered?(handle: Handle, hovered: boolean): void;
  applyAnchor?(handle: Handle, isAnchor: boolean): void;
}

export type AdapterMap<Handle, Descriptor> = Partial<
  Record<LabelType, LabelKindAdapter<Handle, Descriptor>>
>;
