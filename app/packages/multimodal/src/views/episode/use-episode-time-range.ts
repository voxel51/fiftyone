import type { TimeWindow } from "../../ir";
import type { EpisodeSession } from "../../ports";

/** Resolves the active session's exact format-neutral timeline range. */
export function useEpisodeTimeRange(
  session: EpisodeSession | null,
): TimeWindow | null {
  return session?.manifest.timeRange ?? null;
}
