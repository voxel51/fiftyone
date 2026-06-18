/**
 * The temporal {@link TemporalView}: presence is the pool subset whose
 * occurrence coordinate matches the playhead's current frame (sample-level
 * refs — `frame == null` — are always present). Time lives in the {@link Clock}
 * (seconds); each frame view maps time to its own frame, so concurrently-
 * playing media at different fps stay in sync through shared time.
 *
 * Presence is tracked at LINKAGE (track) granularity, not full-ref: one track
 * has one box per frame, so moving the playhead within a track's span is a
 * `refresh` of the same entity (new frame-local geometry), not exit+enter. A
 * frame-locked bridge resolves handles by instanceId, so `refresh` updates the
 * one handle in place.
 *
 * Two triggers, deliberately asymmetric:
 *  - clock moves        → diff present-set, EMIT enter/exit/refresh (projection)
 *  - store changes      → refresh the cache SILENTLY (no emit). The change
 *    stream already drives the bridge's own reconcile for current-frame edits;
 *    the silent refresh only keeps the cache honest so the NEXT clock diff sees
 *    the right baseline (e.g. a box drawn at frame N must `exit` when the
 *    playhead later leaves N).
 */

import { LabelType } from "@fiftyone/utilities";

import type { LabelRef } from "../identity/ref";
import { linkageKey, refKey } from "../identity/ref";
import type { ChangeListener } from "../store/types";
import type {
  Clock,
  PresenceEvent,
  PresenceListener,
  TemporalView,
} from "./types";

const ALL_LABEL_TYPES = Object.values(LabelType).filter(
  (type) => type !== LabelType.Unknown
);

/** The pool half the view reads, plus the change channel it tracks. */
export interface FrameReads {
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[];
  getLabel(ref: LabelRef): unknown;
  subscribeChanges(listener: ChangeListener): () => void;
}

export class FrameTemporalView implements TemporalView {
  readonly isTemporal = true;

  private reads: FrameReads;
  private clock: Clock;
  /** Maps clock time (seconds) → frame number; injected so fps lives in one place. */
  private frameAtTime: (time: number) => number;

  private listeners = new Set<PresenceListener>();

  /** Present refs at the last-observed frame, keyed by linkage (track) identity. */
  private present: Map<string, LabelRef>;

  constructor(
    reads: FrameReads,
    clock: Clock,
    frameAtTime: (time: number) => number
  ) {
    this.reads = reads;
    this.clock = clock;
    this.frameAtTime = frameAtTime;
    this.present = this.computePresent();

    this.clock.subscribe(() => this.onClock());
    this.reads.subscribeChanges(() => {
      this.present = this.computePresent();
    });
  }

  getPresent(): readonly LabelRef[] {
    return [...this.computePresent().values()];
  }

  isPresent(ref: LabelRef): boolean {
    return ref.frame == null || ref.frame === this.currentFrame();
  }

  subscribePresence(listener: PresenceListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---- internals ----

  private currentFrame(): number {
    return this.frameAtTime(this.clock.getTime());
  }

  private computePresent(): Map<string, LabelRef> {
    const frame = this.currentFrame();
    const present = new Map<string, LabelRef>();

    for (const ref of this.reads.enumerateLabels(ALL_LABEL_TYPES)) {
      if (ref.frame == null || ref.frame === frame) {
        present.set(linkageKey(ref), ref);
      }
    }

    return present;
  }

  private onClock(): void {
    const next = this.computePresent();
    const events: PresenceEvent[] = [];

    for (const [key, ref] of this.present) {
      if (!next.has(key)) {
        events.push({ ref, kind: "exit" });
      }
    }

    for (const [key, ref] of next) {
      const prev = this.present.get(key);

      if (!prev) {
        events.push({ ref, kind: "enter" });
        continue;
      }

      // same track, different occurrence (the playhead moved within its span)
      if (refKey(prev) !== refKey(ref)) {
        events.push({ ref, kind: "refresh" });
      }
    }

    this.present = next;

    if (events.length === 0) {
      return;
    }

    for (const listener of this.listeners) {
      listener(events);
    }
  }
}
