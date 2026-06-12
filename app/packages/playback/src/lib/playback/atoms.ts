// ---------------------------------------------------------------------------
// Module-level atom definitions for the continuous-time playback engine.
//
// Each PlaybackProvider creates its own Jotai store (via createStore), so
// atom values are scoped per provider instance. Multiple independent
// playback instances on the same page each get their own copy.
//
// These atoms are an implementation detail of this package — they are NOT
// exported from the package index. Access is layered by consumer role:
//
// - React components subscribe through the hooks in `use-playback-state.ts`
//   / `use-stream.ts`, which bind the surrounding provider's store. (Bare
//   `useAtomValue(atom)` would silently resolve a nested foreign Jotai
//   Provider's store — see `playback-store-context.ts`.)
// - Stream plumbing and tests that already hold a PlaybackStore use the
//   imperative helpers in `store-access.ts`.
// - Code inside this lib layer (the engine's RAF loop, stream bases) uses
//   the atoms directly via store.get / store.set — that's the layer the
//   helpers wrap.
// ---------------------------------------------------------------------------

import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { BufferedRanges, SeekEvent } from "./types";

/**
 * Per-stream reactive value atom, keyed by stream id. Lazily created on first
 * access. Streams write their resolved data into `streamValueAtom(id)` from
 * `onCommit`; consumers read it via `useStream(id)`.
 *
 * Atoms persist for the lifetime of the store — a consumer that subscribes
 * before its stream registers will get `null` until the stream's first commit.
 */
// `atom<unknown>(null)` would resolve to `PrimitiveAtom<unknown>` in
// theory, but Jotai's overloads narrow it to a read-only `Atom<unknown>`
// because the bare `null` initial value matches the read-fn overload
// first. Cast preserves the writable shape so subclasses' onCommit can
// call `store.set(streamValueAtom(id), ...)`.
export const streamValueAtom = atomFamily(
  (_id: string) => atom<unknown>(null) as PrimitiveAtom<unknown>
);

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
 * time. The RAF loop sets this while playing; seek/step set it while
 * paused. UI components read it to show spinners.
 *
 * While paused, the engine has no tick to clear it — the stream that
 * fulfils the pending data is expected to flip it back to `false` (the
 * MCAP data stream does this when the playhead tick becomes covered).
 */
export const isBufferingAtom = atom(false);

/**
 * Optional human-readable progress detail to render next to the buffering
 * indicator (e.g. "3/7 streams"). Streams that can quantify their catch-up
 * progress write it; `null` hides the detail.
 */
export const bufferingDetailAtom = atom<string | null>(null) as PrimitiveAtom<
  string | null
>;

/**
 * Time ranges where every blocking stream has data buffered and ready to
 * play. Written by the data layer (e.g. the MCAP data stream, throttled);
 * rendered as shading along the timeline's top edge so users can see how
 * far ahead playback can run.
 */
export const bufferedRangesAtom = atom<BufferedRanges>([]);

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
 * Streams subscribe to this atom — via useSeekEvent or store.sub — to
 * flush their cache and start buffering around the new position. The
 * engine debounces updates to this atom during rapid scrubbing so streams
 * don't thrash. playheadAtom always updates immediately for smooth UI.
 */
// See `streamValueAtom` — same null-initial-value overload quirk; the
// cast preserves the writable shape so `store.set(seekEventAtom, ...)`
// keeps its setter signature.
export const seekEventAtom = atom<SeekEvent | null>(
  null
) as PrimitiveAtom<SeekEvent | null>;
