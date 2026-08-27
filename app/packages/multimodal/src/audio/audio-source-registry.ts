// ---------------------------------------------------------------------------
// Per-source audio demand and published state.
//
// Two separate questions, both keyed by scene-source id:
//
//   demand — does anything actually want this source's samples right now?
//   state  — what did the one reader that owns this source produce?
//
// Splitting them is what lets a recording advertise its audio (mixer rows,
// volume control) without reading or decoding anything. Nothing here starts
// work; it only records who is asking and hands back what the owner found.
//
// Held in the playback store rather than a React context so both the ambient
// registrar and any tile can reach it — they are siblings under
// `PlaybackProvider`, with no common ancestor of their own to hang a
// provider on.
// ---------------------------------------------------------------------------

import { usePlaybackStore } from "@fiftyone/playback";
import { atom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";

import type { UseAudioPlaybackResult } from "./use-audio-playback";

/**
 * Reference counts, not booleans: a source can be wanted by several
 * consumers at once (an open tile and an audible mixer row), and the first
 * of them to unmount must not cancel the others' demand.
 */
const audioDemandAtom = atom<Readonly<Record<string, number>>>({});

/** What the owning reader last reported, for consumers that only observe. */
const audioSourceStateAtom = atom<
  Readonly<Record<string, UseAudioPlaybackResult>>
>({});

/** Idle result for a source nothing has read yet. */
export const IDLE_AUDIO_SOURCE_STATE: UseAudioPlaybackResult = Object.freeze({
  channels: 0,
  hasAudio: false,
  metadata: null,
  status: "idle",
  waveformPeaks: null,
});

/**
 * Declares that this component wants `sourceId`'s audio for as long as it is
 * mounted and `active`. Mounting an audio tile, or a track becoming audible,
 * are the two things that say so today.
 */
export function useRequestAudio(sourceId: string, active = true): void {
  const store = usePlaybackStore();
  useEffect(() => {
    if (!sourceId || !active) return undefined;
    store.set(audioDemandAtom, (current) => ({
      ...current,
      [sourceId]: (current[sourceId] ?? 0) + 1,
    }));
    return () => {
      store.set(audioDemandAtom, (current) => {
        const remaining = (current[sourceId] ?? 0) - 1;
        if (remaining > 0) return { ...current, [sourceId]: remaining };
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
    };
  }, [active, sourceId, store]);
}

/** Whether anything currently wants `sourceId`'s audio. */
export function useAudioDemanded(sourceId: string): boolean {
  const store = usePlaybackStore();
  const demand = useAtomValue(audioDemandAtom, { store });
  return Boolean(sourceId) && (demand[sourceId] ?? 0) > 0;
}

/**
 * Publishes the owning reader's result so observers do not have to start a
 * second reader to see it. Clears on unmount so a stale waveform cannot
 * outlive the reader that produced it.
 */
export function usePublishAudioSourceState(
  sourceId: string,
  state: UseAudioPlaybackResult,
): void {
  const store = usePlaybackStore();
  useEffect(() => {
    if (!sourceId) return undefined;
    store.set(audioSourceStateAtom, (current) => ({
      ...current,
      [sourceId]: state,
    }));
    return () => {
      store.set(audioSourceStateAtom, (current) => {
        if (!(sourceId in current)) return current;
        const next = { ...current };
        delete next[sourceId];
        return next;
      });
    };
  }, [sourceId, state, store]);
}

/**
 * Reads what the owning reader published for `sourceId`. Observers get the
 * idle result until a reader exists — which, with demand gating, is until
 * something has asked for it.
 */
export function useAudioSourceState(sourceId: string): UseAudioPlaybackResult {
  const store = usePlaybackStore();
  const states = useAtomValue(audioSourceStateAtom, { store });
  return useMemo(
    () => (sourceId ? states[sourceId] : undefined) ?? IDLE_AUDIO_SOURCE_STATE,
    [sourceId, states],
  );
}
