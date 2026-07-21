import { usePlaybackStore, type PlaybackStore } from "@fiftyone/playback";
import { atom, useAtomValue, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useMemo } from "react";
import type { DecodedDiagnostic } from "../../../ir";

/**
 * Per-stream playback readiness at the current playhead tick:
 *
 * - "loading" — the tick isn't cached for this stream yet (fetch in flight
 *   or about to be requested). Tiles keep their previous frame and show a
 *   subtle catching-up indicator.
 * - "ready"   — the latest message at or before the current tick is being shown
 *   within the stale-warning threshold.
 * - "stale"   — the latest message at or before the current tick is still being
 *   shown, but is older than the configured stale-warning threshold.
 * - "gap"     — the tick was fetched and the stream has no message at or
 *   before it. Under latest-at-or-before selection this means the
 *   playhead is before the stream's first message.
 * - "failed"  — repeated fetch/decode failures for this stream. Sticky
 *   until a later fetch for the stream succeeds.
 */
export type EpisodeStreamStatus =
  | "loading"
  | "ready"
  | "stale"
  | "gap"
  | "failed";

/**
 * Per-stream status, stored in the surrounding PlaybackProvider's store
 * (the same per-modal-instance store that carries the stream values).
 * Private to this module:
 * components read via `useEpisodeStreamStatuses`, the data stream and tests
 * use the get/set helpers with the store they already hold.
 */
// Same writable-shape cast as the playback atoms — jotai's null-ish
// initial value overload would otherwise narrow this to a read-only Atom.
const episodeStreamStatusAtom = atomFamily(
  (_stream: string) =>
    atom<EpisodeStreamStatus>("loading") as PrimitiveAtom<EpisodeStreamStatus>,
);

/**
 * Per-stream first-message time in timeline seconds, written once per
 * source by the episode data stream. Null until resolved (or when the file
 * carries no usable indexes for the stream). Lets tile chrome say "No
 * data until 0:12" instead of a generic gap message.
 */
const episodeStreamStartTimeSecAtom = atomFamily(
  (_stream: string) =>
    atom<number | null>(null) as PrimitiveAtom<number | null>,
);

/**
 * Per-stream age of the displayed stale media frame. Null when the stream is not
 * currently stale. Kept separate from `EpisodeStreamStatus` so badges can say
 * exactly how far behind the rendered content is.
 */
const episodeStreamStaleAgeNsAtom = atomFamily(
  (_stream: string) =>
    atom<bigint | null>(null) as PrimitiveAtom<bigint | null>,
);

const EMPTY_DIAGNOSTICS: readonly DecodedDiagnostic[] = [];
const episodeStreamDiagnosticsAtom = atomFamily(
  (_stream: string) =>
    atom<readonly DecodedDiagnostic[]>(EMPTY_DIAGNOSTICS) as PrimitiveAtom<
      readonly DecodedDiagnostic[]
    >,
);

/**
 * Reactive statuses for the given streams, index-aligned with `streams`.
 * Tile chrome (badges, empty states) reads these to summarize the
 * streams behind a tile. Resolves against the surrounding
 * PlaybackProvider's store. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useEpisodeStreamStatuses(
  streams: readonly string[],
): readonly EpisodeStreamStatus[] {
  const store = usePlaybackStore();
  const statusesAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(episodeStreamStatusAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(statusesAtom, { store });
}

/**
 * Reactive first-message times (timeline seconds) for the given streams,
 * index-aligned with `streams`. Pass a referentially stable array.
 */
export function useEpisodeStreamStartTimes(
  streams: readonly string[],
): readonly (number | null)[] {
  const store = usePlaybackStore();
  const startTimesAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(episodeStreamStartTimeSecAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(startTimesAtom, { store });
}

/**
 * Reactive displayed-frame stale ages, index-aligned with `streams`. Null means
 * the stream is not currently stale.
 */
export function useEpisodeStreamStaleAges(
  streams: readonly string[],
): readonly (bigint | null)[] {
  const store = usePlaybackStore();
  const staleAgesAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(episodeStreamStaleAgeNsAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(staleAgesAtom, { store });
}

/** Decoder capability diagnostics, index-aligned with the supplied streams. */
export function useEpisodeStreamDiagnostics(
  streams: readonly string[],
): readonly (readonly DecodedDiagnostic[])[] {
  const store = usePlaybackStore();
  const diagnosticsAtom = useMemo(
    () =>
      atom((get) =>
        streams.map((stream) => get(episodeStreamDiagnosticsAtom(stream))),
      ),
    [streams],
  );
  return useAtomValue(diagnosticsAtom, { store });
}

/** Non-reactive read for the data stream and tests. */
export function getEpisodeStreamStatus(
  store: PlaybackStore,
  stream: string,
): EpisodeStreamStatus {
  return store.get(episodeStreamStatusAtom(stream));
}

/** Non-reactive write for the data stream's status publishing. */
export function setEpisodeStreamStatus(
  store: PlaybackStore,
  stream: string,
  status: EpisodeStreamStatus,
): void {
  store.set(episodeStreamStatusAtom(stream), status);
}

/** Non-reactive read for the data stream and tests. */
export function getEpisodeStreamStaleAgeNs(
  store: PlaybackStore,
  stream: string,
): bigint | null {
  return store.get(episodeStreamStaleAgeNsAtom(stream));
}

/** Non-reactive write for the data stream's stale warning publishing. */
export function setEpisodeStreamStaleAgeNs(
  store: PlaybackStore,
  stream: string,
  ageNs: bigint | null,
): void {
  store.set(episodeStreamStaleAgeNsAtom(stream), ageNs);
}

/** Replaces a stream's latest decoder diagnostics when their content changes. */
export function setEpisodeStreamDiagnostics(
  store: PlaybackStore,
  stream: string,
  diagnostics: readonly DecodedDiagnostic[],
): void {
  const atom = episodeStreamDiagnosticsAtom(stream);
  const next = diagnostics.length > 0 ? diagnostics : EMPTY_DIAGNOSTICS;
  if (decodedDiagnosticsEqual(store.get(atom), next)) return;
  store.set(atom, next);
}

/** Reads a stream's latest decoder diagnostics without subscribing. */
export function getEpisodeStreamDiagnostics(
  store: PlaybackStore,
  stream: string,
): readonly DecodedDiagnostic[] {
  return store.get(episodeStreamDiagnosticsAtom(stream));
}

function decodedDiagnosticsEqual(
  left: readonly DecodedDiagnostic[],
  right: readonly DecodedDiagnostic[],
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((diagnostic, index) => {
        const candidate = right[index];
        return (
          candidate !== undefined &&
          diagnostic.capability === candidate.capability &&
          diagnostic.code === candidate.code &&
          diagnostic.message === candidate.message &&
          diagnostic.severity === candidate.severity
        );
      }))
  );
}

/** Non-reactive write for the data stream's stream-bounds publishing. */
export function setEpisodeStreamStartTimeSec(
  store: PlaybackStore,
  stream: string,
  startTimeSec: number | null,
): void {
  store.set(episodeStreamStartTimeSecAtom(stream), startTimeSec);
}
