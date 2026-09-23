import { useEffect, useMemo, useState } from "react";
import { getVideoLabelsIndex } from "../../../core/src/client/videoLabelsClient";
import type { IndexInstance } from "../tracks/frameTracks";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

interface VideoLabelsIndexState {
  /** Per-field presence baseline, keyed by the full engine path (`frames.X`). */
  indexByPath: Record<string, IndexInstance[]>;
  /** True once the fetch settles (success or failure) — gates first paint. */
  loaded: boolean;
}

const EMPTY: VideoLabelsIndexState = { indexByPath: {}, loaded: false };

/**
 * The stored answer, tagged with the inputs it answers for. State outlives the
 * inputs it was fetched for by a render: when the stream is swapped or torn
 * down, the first render sees the NEW stream (or none) beside the OLD state,
 * and reporting that state's `loaded` for it would let a consumer read "settled,
 * and empty" during the swap. The tag lets the read below say "not yet" instead.
 */
interface StoredIndexState extends VideoLabelsIndexState {
  stream: VideoFrameLabelsStream | null;
  key: string;
}

const FRAMES_PREFIX = "frames.";

/** The index endpoint keys fields frame-relative (e.g. `detections`). */
const toPerFrameField = (path: string): string =>
  path.startsWith(FRAMES_PREFIX) ? path.slice(FRAMES_PREFIX.length) : path;

/**
 * Fetch the timeline distribution index for `fields`, one fetch per (stream,
 * field set, dynamic-attribute set), re-keyed by the full `frames.X` engine
 * path. Never re-fetches on save; live edits ride the engine overlay.
 */
export function useVideoLabelsIndex(
  stream: VideoFrameLabelsStream | null,
  fields: string[],
  dynamicAttributes: string[] = [],
): VideoLabelsIndexState {
  const fieldsKey = fields.join(",");
  const dynamicKey = dynamicAttributes.join(",");
  const key = `${fieldsKey}|${dynamicKey}`;
  const [state, setState] = useState<StoredIndexState>({
    ...EMPTY,
    stream: null,
    key,
  });

  useEffect(() => {
    if (!stream || fields.length === 0) {
      setState({ ...EMPTY, stream, key });
      return undefined;
    }

    let cancelled = false;
    setState({ ...EMPTY, stream, key });

    const { sampleId, dataset, view, dynamicGroup } = stream.labelQuery();

    void getVideoLabelsIndex({
      sampleId,
      dataset,
      view,
      dynamicGroup: dynamicGroup ?? undefined,
      fields: fields.map(toPerFrameField),
      dynamicAttributes,
    })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const indexByPath: Record<string, IndexInstance[]> = {};
        for (const path of fields) {
          indexByPath[path] = response[toPerFrameField(path)]?.instances ?? [];
        }

        setState({ indexByPath, loaded: true, stream, key });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ indexByPath: {}, loaded: true, stream, key });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldsKey/dynamicKey capture the arrays
  }, [stream, fieldsKey, dynamicKey]);

  // Answer only for the CURRENT inputs — see `StoredIndexState`.
  const current = state.stream === stream && state.key === key;

  return useMemo(
    () =>
      current
        ? { indexByPath: state.indexByPath, loaded: state.loaded }
        : EMPTY,
    [current, state.indexByPath, state.loaded],
  );
}
