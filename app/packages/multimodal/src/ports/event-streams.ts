import type { TemporalEvent, TimeWindow } from "../ir";

/** A bounded view of computed events, including explicit computation evidence. */
export interface EventStreamResult {
  readonly streamId: string;
  readonly events: readonly TemporalEvent[];
  /** Count before response/render caps, when known. */
  readonly totalCount?: number;
  readonly computedRanges: readonly TimeWindow[];
  readonly truncated: boolean;
  readonly canContinue: boolean;
  readonly message?: string;
}

/** On-demand event reads. Results are ephemeral and never written to a dataset. */
export interface EventStreamsCapability {
  readEvents(request: {
    readonly streams: readonly string[];
    readonly window: TimeWindow;
    readonly signal?: AbortSignal;
    /** Explicit consent to another bounded computation grant. */
    readonly continue?: boolean;
  }): Promise<readonly EventStreamResult[]>;
}
