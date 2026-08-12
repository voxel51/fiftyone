import { useEffect, useMemo, useState } from "react";
import type { EpisodeSession } from "../../../ports";
import { createEpisodePlaybackRuntime } from "../../../runtime/read-policy";
import {
  logConsoleRowsFromDecodedMessage,
  type EpisodeLogConsoleRow,
} from "../../../visualization/logs/log-console-rows";

export interface DiagnosticSeedState {
  readonly error?: string;
  readonly generation: string;
  readonly rows: readonly EpisodeLogConsoleRow[];
  readonly status: "idle" | "loading" | "ready" | "error";
}

/** DiagnosticArray streams selected in the shared log evidence cache. */
export function diagnosticStreamIds(
  session: EpisodeSession | null,
  selectedStreams: readonly string[],
): readonly string[] {
  if (!session) return [];
  const selected = new Set(selectedStreams);
  return session.manifest.streams
    .filter(
      (stream) =>
        selected.has(stream.id) &&
        /(?:^|\/)DiagnosticArray$/i.test(stream.payload.schema ?? ""),
    )
    .map((stream) => stream.id);
}

/**
 * Resolves one discontinuous-seek predecessor message per diagnostic stream.
 * Normal Follow never calls this path; its keyed fold stays alive as the raw
 * evidence window slides.
 */
export function useDiagnosticSeed({
  enabled,
  generation,
  seedTimeNs,
  session,
  streams,
}: {
  readonly enabled: boolean;
  readonly generation: string;
  readonly seedTimeNs?: bigint;
  readonly session: EpisodeSession | null;
  readonly streams: readonly string[];
}): DiagnosticSeedState {
  const playback = useMemo(
    () =>
      enabled && session && seedTimeNs !== undefined && streams.length > 0
        ? createEpisodePlaybackRuntime(session)
        : null,
    [enabled, seedTimeNs, session, streams.length],
  );
  const [state, setState] = useState<DiagnosticSeedState>({
    generation: "",
    rows: [],
    status: "idle",
  });

  useEffect(() => {
    if (
      !enabled ||
      !playback ||
      seedTimeNs === undefined ||
      streams.length === 0
    ) {
      setState((current) =>
        current.generation === generation && current.status === "ready"
          ? current
          : { generation, rows: [], status: "ready" },
      );
      return undefined;
    }
    const controller = new AbortController();
    setState({ generation, rows: [], status: "loading" });
    void playback
      .readSynchronized({
        signal: controller.signal,
        streams,
        timeNs: seedTimeNs,
      })
      .then((window) => {
        if (controller.signal.aborted) return;
        const rows: EpisodeLogConsoleRow[] = [];
        for (const frame of window.frames) {
          for (const row of logConsoleRowsFromDecodedMessage(frame)) {
            if (row.kind === "diagnostic" && row.timelineTimeNs <= seedTimeNs) {
              rows.push(row);
            }
          }
        }
        setState({ generation, rows, status: "ready" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          error: error instanceof Error ? error.message : String(error),
          generation,
          rows: [],
          status: "error",
        });
      });
    return () => controller.abort();
  }, [enabled, generation, playback, seedTimeNs, streams]);

  return state.generation === generation
    ? state
    : { generation, rows: [], status: "loading" };
}
