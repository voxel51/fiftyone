import { useEffect, useState } from "react";
import { getVideoLabelsIndex } from "../../../core/src/client/videoLabelsClient";
import type { IndexInstance } from "../tracks/frameTracks";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

interface VideoLabelsIndexState {
  /** Per-instance presence baseline for the stream's label field. */
  index: IndexInstance[];
  /** True once the fetch settles (success or failure) — gates first paint. */
  loaded: boolean;
}

const EMPTY: VideoLabelsIndexState = { index: [], loaded: false };

/**
 * Fetch the timeline distribution index for the active labels stream's field.
 * One fetch per stream identity — the registrar re-mounts the stream (and so
 * this hook) when the sample, dataset, or field changes. The result is the
 * server baseline; live edits ride the engine overlay at merge time, so this
 * never re-fetches on save.
 */
export function useVideoLabelsIndex(
  stream: VideoFrameLabelsStream | null
): VideoLabelsIndexState {
  const [state, setState] = useState<VideoLabelsIndexState>(EMPTY);

  useEffect(() => {
    if (!stream) {
      setState(EMPTY);
      return undefined;
    }

    let cancelled = false;
    setState(EMPTY);

    const field = stream.labelsField;
    const { sampleId, dataset, view } = stream.labelQuery();

    void getVideoLabelsIndex({ sampleId, dataset, view, fields: [field] })
      .then((response) => {
        if (cancelled) {
          return;
        }

        setState({ index: response[field]?.instances ?? [], loaded: true });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({ index: [], loaded: true });
      });

    return () => {
      cancelled = true;
    };
  }, [stream]);

  return state;
}
