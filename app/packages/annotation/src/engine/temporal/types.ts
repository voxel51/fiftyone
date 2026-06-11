/**
 * Temporal contracts (spec §4.1): the pool/presence split. The pool is every
 * entity in the stores, frame-agnostic; presence is the subset present at the
 * current time, derived from (pool × clock). Presence events never dirty
 * anything and never enter a patch — the change stream stays purely semantic.
 */

import type { LabelRef } from "../identity/ref";

/** `refresh` = same entity, new frame-local geometry (playhead moved within its span). */
export type PresenceEvent = {
  ref: LabelRef;
  kind: "enter" | "exit" | "refresh";
};

export type PresenceListener = (events: readonly PresenceEvent[]) => void;

/** Derived temporal presence over the pool. Presence ≡ pool when non-temporal. */
export interface TemporalView {
  /** Refs present at the current time (frame stamped). */
  getPresent(): readonly LabelRef[];

  /** Pool refs absent at the playhead are still real — this is a time query. */
  isPresent(ref: LabelRef): boolean;

  subscribePresence(listener: PresenceListener): () => void;
}

/**
 * Session-level time capability, owned/driven by the playback layer and
 * injected at engine construction. TIME (seconds), not a frame number —
 * concurrently-playing media at different fps stay in sync through shared
 * time, each frame store mapping time to its own frame.
 */
export interface Clock {
  getTime(): number;
  subscribe(listener: (time: number) => void): () => void;
}
