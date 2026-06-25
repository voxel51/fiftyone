import { useEffect, useState } from "react";
import { getVideoLabelsIndex } from "../../../core/src/client/videoLabelsClient";
import type { IndexInstance } from "../tracks/frameTracks";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

interface VideoLabelsIndexState {
  /** Per-field presence baseline, keyed by frame label path. */
  indexByPath: Record<string, IndexInstance[]>;
  /** True once the fetch settles (success or failure) — gates first paint. */
  loaded: boolean;
}

const EMPTY: VideoLabelsIndexState = { indexByPath: {}, loaded: false };

/**
 * Fetch the timeline distribution index for every declared frame label field.
 * One fetch per (stream identity, field set) — the registrar re-mounts the
 * stream when the sample/dataset changes, and the field set is stable per
 * dataset/view, so visibility toggles don't re-fetch (callers filter the
 * returned map by the visible set). The result is the server baseline; live
 * edits ride the engine overlay at merge time, so this never re-fetches on save.
 */
export function useVideoLabelsIndex(
  stream: VideoFrameLabelsStream | null,
  fields: string[]
): VideoLabelsIndexState {
  const [state, setState] = useState<VideoLabelsIndexState>(EMPTY);
  const fieldsKey = fields.join(",");

  useEffect(() => {
    if (!stream || fields.length === 0) {
      setState(EMPTY);
      return undefined;
    }

    let cancelled = false;
    setState(EMPTY);

    const { sampleId, dataset, view } = stream.labelQuery();

    void getVideoLabelsIndex({ sampleId, dataset, view, fields })
      .then((response) => {
        if (cancelled) {
          return;
        }

        const indexByPath: Record<string, IndexInstance[]> = {};
        for (const field of fields) {
          indexByPath[field] = response[field]?.instances ?? [];
        }

        setState({ indexByPath, loaded: true });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ indexByPath: {}, loaded: true });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldsKey captures `fields`
  }, [stream, fieldsKey]);

  return state;
}
