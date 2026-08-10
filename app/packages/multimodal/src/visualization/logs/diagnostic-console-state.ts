import type { EpisodeLogConsoleRow } from "./log-console-rows";

export type DiagnosticFreshness = "current" | "stale" | "unknown";

/** Latest reported state and playback-relative freshness for one identity. */
export interface EpisodeDiagnosticState {
  readonly ageNs: bigint;
  readonly freshness: DiagnosticFreshness;
  readonly id: string;
  readonly row: EpisodeLogConsoleRow;
  readonly staleAfterNs: bigint;
}
