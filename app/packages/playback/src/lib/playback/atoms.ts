// ---------------------------------------------------------------------------
// Module-level atom definitions for the continuous-time playback engine.
//
// Each PlaybackProvider creates its own Jotai store
// (via createStore + <JotaiProvider store={...}>), so atom values are scoped
// per provider instance. Multiple independent playback instances
// on the same page each get their own copy of these values.
//
// Components read atoms ONLY through the wrapper hooks in
// `use-playback-state.ts` (e.g. usePlayhead, useViewStart). Don't call
// useAtomValue / useAtom on these atoms directly from components — keep
// jotai isolated to the lib layer. The RAF loop reads/writes
// imperatively via store.get / store.set.
// ---------------------------------------------------------------------------

import { atom } from "jotai";
import { atomFamily } from "jotai/utils";

/**
 * Per-stream reactive value atom, keyed by stream id. Lazily created on first
 * access. Streams write their resolved data into `streamValueAtom(id)` from
 * `onCommit`; consumers read it via `useStream(id)`.
 *
 * Atoms persist for the lifetime of the store — a consumer that subscribes
 * before its stream registers will get `null` until the stream's first commit.
 */
export const streamValueAtom = atomFamily((_id: string) => atom<unknown>(null));

/**
 * The visual playhead position. Updates immediately on every seek, scrub, and
 * RAF tick for smooth UI. Use this to position the playhead needle and display
 * the time readout. Do NOT use this to drive data — stream data may not be
 * ready at this time yet.
 */
export const playheadAtom = atom(0);

/**
 * The last time the engine confirmed all blocking streams were ready and
 * advanced the playhead. This is the authoritative "what should I render"
 * time for data-driven consumers. Lags behind `playheadAtom` when streams
 * are buffering.
 */
export const currentTimeAtom = atom(0);

export const isPlayingAtom = atom(false);

/**
 * True when at least one blocking stream is not ready at the next target
 * time. The RAF loop sets this; UI components read it to show spinners.
 */
export const isBufferingAtom = atom(false);

// View window (the visible time range in the ruler/track area)
export const viewStartAtom = atom(0);
export const viewEndAtom = atom(0); // initialised to duration by PlaybackProvider

// Loop region
export const loopStartAtom = atom(0);
export const loopEndAtom = atom(0); // initialised to duration by PlaybackProvider

// Static config — set once by PlaybackProvider, never changed.
export const durationAtom = atom(0);
export const stepIntervalAtom = atom(1 / 30);

/**
 * Playback speed multiplier. 1.0 = normal speed, 2.0 = double speed,
 * 0.5 = half speed. Applied to the dt on every RAF tick.
 */
export const speedAtom = atom(1.0);

/**
 * Fired on discontinuous playhead jumps: user seek, step forward/back,
 * play() resetting to loop start, and loop-wrap. NOT fired on normal
 * frame-by-frame RAF ticks.
 *
 * The `seq` counter makes each event distinguishable even when `time`
 * hasn't changed (e.g. seeking to the same position twice).
 *
 * Streams subscribe to this atom — via useAtomValue or store.sub — to
 * flush their cache and start buffering around the new position. The
 * engine debounces updates to this atom during rapid scrubbing so streams
 * don't thrash. playheadAtom always updates immediately for smooth UI.
 */
export const seekEventAtom = atom<{ time: number; seq: number } | null>(null);
