/**
 * Temporal contracts: the pool/presence split. The pool is every
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
  /**
   * Does this view discriminate by time? `false` for the non-temporal pool
   * view (presence ≡ pool, `isPresent` conflates with existence); `true` for a
   * real frame view (`isPresent` is a pure frame query, independent of
   * existence). The read-half loop reads this to decide whether a frame-locked
   * bridge may filter out off-frame changes — under the pool view it must not,
   * or a delete (which leaves the pool) would never unmount.
   */
  readonly isTemporal: boolean;

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
