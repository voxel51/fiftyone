import { VISUALIZATION_KIND } from "./visualization-kinds";

/** JSON-compatible event metadata with no executable or binary values. */
export type EventAttribute =
  | null
  | boolean
  | number
  | string
  | readonly EventAttribute[]
  | { readonly [key: string]: EventAttribute };

/** Point event or closed interval. Identity is stable within its named stream. */
export interface TemporalEvent {
  readonly id: string;
  readonly label: string;
  readonly startNs: bigint;
  readonly endNs?: bigint;
  readonly attributes?: Readonly<Record<string, EventAttribute>>;
}

/** One scalar sample; null explicitly breaks a signal. */
export interface NumericSignalVisualization {
  readonly kind: typeof VISUALIZATION_KIND.NUMERIC_SIGNAL;
  readonly value: number | null;
}

/** Event upserts emitted at a message timestamp, not a snapshot of event history. */
export interface TrackEventsVisualization {
  readonly kind: typeof VISUALIZATION_KIND.TRACK_EVENTS;
  readonly events: readonly TemporalEvent[];
}
