/**
 * The temporal {@link TemporalView}: presence is the pool subset whose
 * occurrence coordinate matches the playhead's current frame. Sample-level refs
 * (`frame == null`) are present too, EXCEPT temporal detections, which are gated
 * by their `support` span — a TD shows only while the playhead sits inside
 * `[support[0], support[1]]`. Time lives in the {@link Clock} (seconds); each
 * frame view maps time to its own frame, so concurrently-playing media at
 * different fps stay in sync through shared time.
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

/** The two fields frame-presence reads off a sample-level label. */
interface PresenceProbe {
  _cls?: string;
  support?: unknown;
}

/** A label whose presence is gated by a `support` span. */
const isTemporalDetection = (label: PresenceProbe | undefined): boolean =>
  label?._cls === "TemporalDetection";

/** A well-formed `[start, end]` frame span, else undefined. */
const supportSpan = (
  label: PresenceProbe
): readonly [number, number] | undefined => {
  const support = label.support;

  if (
    !Array.isArray(support) ||
    support.length !== 2 ||
    !Number.isFinite(support[0]) ||
    !Number.isFinite(support[1])
  ) {
    return undefined;
  }

  return [support[0], support[1]];
};

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

  /** Clock + change-stream teardown, released on {@link dispose}. */
  private unsubscribers: Array<() => void> = [];

  constructor(
    reads: FrameReads,
    clock: Clock,
    frameAtTime: (time: number) => number
  ) {
    this.reads = reads;
    this.clock = clock;
    this.frameAtTime = frameAtTime;
    this.present = this.computePresent();

    this.unsubscribers.push(this.clock.subscribe(() => this.onClock()));
    this.unsubscribers.push(
      this.reads.subscribeChanges(() => {
        this.present = this.computePresent();
      })
    );
  }

  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers = [];
    this.listeners.clear();
  }

  getPresent(): readonly LabelRef[] {
    return [...this.present.values()];
  }

  isPresent(ref: LabelRef): boolean {
    if (ref.frame == null) {
      return this.sampleLevelPresent(ref, this.currentFrame());
    }

    return ref.frame === this.currentFrame();
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
      if (ref.frame == null) {
        if (this.sampleLevelPresent(ref, frame)) {
          present.set(linkageKey(ref), ref);
        }

        continue;
      }

      if (ref.frame === frame) {
        present.set(linkageKey(ref), ref);
      }
    }

    return present;
  }

  /**
   * Sample-level presence: most sample-level labels are always present, but a
   * temporal detection is gated by its `support` span. A malformed / missing
   * support falls through to present so a label is never silently dropped.
   */
  private sampleLevelPresent(ref: LabelRef, frame: number): boolean {
    const label = this.reads.getLabel(ref) as PresenceProbe | undefined;

    if (!isTemporalDetection(label)) {
      return true;
    }

    const span = supportSpan(label as PresenceProbe);

    if (!span) {
      return true;
    }

    return frame >= span[0] && frame <= span[1];
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
