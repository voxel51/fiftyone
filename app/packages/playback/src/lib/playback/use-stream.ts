import { atom, type Atom, useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useEffect, useMemo } from "react";
import { usePlayback } from "./PlaybackProvider";
import { usePlaybackStore } from "./playback-store-context";
import { streamValueAtom } from "./atoms";

/**
 * Reactive read of a stream's current committed value, WITHOUT marking the
 * stream active. For consumers whose activation is managed elsewhere —
 * e.g. MCAP tiles subscribe per-topic through the data stream, which owns
 * a single engine-level stream for all topics. Most consumers want
 * `useStream(id)`, which also activates the stream.
 *
 * Returns `null` until the stream produces its first committed value.
 */
export function useStreamValue<T = unknown>(id: string): T | null {
  const store = usePlaybackStore();
  // Target the playback store explicitly — see `playback-store-context.ts`
  // for why we can't rely on Jotai's nearest-provider lookup.
  return useAtomValue(streamValueAtom(id), { store }) as T | null;
}

/**
 * Reactive read of a derived stream value. The consuming component only
 * re-renders when the selected value changes according to `isEqual`, allowing
 * high-frequency transport metadata to stay out of content-only surfaces.
 * Keep `selector` and `isEqual` referentially stable.
 */
export function useStreamValueSelector<T, Selected>(
  id: string,
  selector: (value: T | null) => Selected,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
): Selected {
  const store = usePlaybackStore();
  const selectedAtom = useMemo(
    () => selectAtom(streamValueAtom(id) as Atom<T | null>, selector, isEqual),
    [id, isEqual, selector],
  );
  return useAtomValue(selectedAtom, { store });
}

/**
 * Reactive read of several streams' committed values, index-aligned with
 * `ids` — one derived-atom subscription instead of N hook calls, since
 * hooks can't be called in a loop over a dynamic id list. Same activation
 * caveat as `useStreamValue`. Pass a referentially stable array — a new
 * identity re-derives the combined atom.
 */
export function useStreamValues<T = unknown>(
  ids: readonly string[],
): readonly (T | null)[] {
  const store = usePlaybackStore();
  const valuesAtom = useMemo(
    () => atom((get) => ids.map((id) => get(streamValueAtom(id)))),
    [ids],
  );
  return useAtomValue(valuesAtom, { store }) as readonly (T | null)[];
}

/** Multi-stream counterpart to {@link useStreamValueSelector}. */
export function useStreamValuesSelector<T, Selected>(
  ids: readonly string[],
  selector: (value: T | null) => Selected,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
): readonly Selected[] {
  const store = usePlaybackStore();
  const valuesAtom = useMemo(
    () =>
      atom((get) =>
        ids.map((id) => selector(get(streamValueAtom(id)) as T | null)),
      ),
    [ids, selector],
  );
  const selectedValuesAtom = useMemo(
    () =>
      selectAtom(
        valuesAtom,
        (value) => value,
        (left, right) => equalSelectedArrays(left, right, isEqual),
      ),
    [isEqual, valuesAtom],
  );
  return useAtomValue(selectedValuesAtom, { store });
}

function equalSelectedArrays<Value>(
  left: readonly Value[],
  right: readonly Value[],
  isEqual: (left: Value, right: Value) => boolean,
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!isEqual(left[index], right[index])) return false;
  }
  return true;
}

/**
 * Mark a stream active WITHOUT reading its value.
 *
 * Activation is what makes the engine drive a stream at all — a registered but
 * dormant stream is skipped by the readiness barrier, so its `blocking` flag is
 * inert and it receives no `bufferState` / `prefetch` / `onCommit`. For streams
 * whose committed value has a React consumer, `useStream` covers this as a side
 * effect of reading. This hook is for the case with no such consumer: a stream
 * that seeds another store directly and needs only its readiness respected.
 *
 * The inverse is {@link useStreamValue} — read without activating.
 */
export function useActivateStream(id: string): void {
  const { subscribeStream } = usePlayback();

  // This effect keeps the engine subscription aligned with the requested id.
  // An empty id is a no-op because the engine never registers one.
  useEffect(() => {
    if (!id) return undefined;
    return subscribeStream(id);
  }, [id, subscribeStream]);
}

/**
 * Subscribe to a stream's current data and re-render when it changes.
 *
 * Returns `null` until the stream is registered and produces its first
 * committed value. The subscription is reference-counted: while at least
 * one consumer holds a subscription the stream is active and the engine
 * drives it. When all consumers unmount the stream goes dormant and the
 * engine stops asking it for data.
 *
 * Provide a type parameter to narrow the return value:
 *
 * ```tsx
 * const frame = useStream<VideoFrame>("camera_front");
 * if (frame) renderImage(frame.src);
 * ```
 */
export function useStream<T = unknown>(id: string): T | null {
  useActivateStream(id);

  return useStreamValue<T>(id);
}
