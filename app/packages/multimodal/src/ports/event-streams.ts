import type { TemporalEvent, TimeWindow } from "../ir";

/** A bounded view of events and the ranges known to be computed. */
export interface EventStreamResult {
  readonly streamId: string;
  readonly events: readonly TemporalEvent[];
  /** Count before response/render caps, when known. */
  readonly totalCount?: number;
  readonly computedRanges: readonly TimeWindow[];
  readonly truncated: boolean;
  /** Why coverage stops where it does, when it stops short of the window. */
  readonly message?: string;
}

/**
 * On-demand event reads. A read reports what is proven now and lets the
 * source keep computing toward the window on its own; results are ephemeral
 * and never written to a dataset.
 */
export interface EventStreamsCapability {
  readEvents(request: {
    readonly streams: readonly string[];
    readonly window: TimeWindow;
    readonly signal?: AbortSignal;
  }): Promise<readonly EventStreamResult[]>;
}
