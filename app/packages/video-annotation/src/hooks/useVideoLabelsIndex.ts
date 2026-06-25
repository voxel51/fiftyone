import { useEffect, useState } from "react";
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

const FRAMES_PREFIX = "frames.";

/** The index endpoint keys fields frame-relative (e.g. `detections`). */
const toPerFrameField = (path: string): string =>
  path.startsWith(FRAMES_PREFIX) ? path.slice(FRAMES_PREFIX.length) : path;

/**
 * Fetch the timeline distribution index for every declared frame label field.
 * One fetch per (stream identity, field set, dynamic-attr set) — the registrar
 * re-mounts the stream when the sample/dataset changes, and the field set is
 * stable per dataset/view, so visibility toggles filter client-side without
 * re-fetching. Fields are sent frame-relative (the endpoint's key space) and the
 * result is re-keyed by the full `frames.X` engine path the timeline builds with.
 * Live edits ride the engine overlay at merge time, so this never re-fetches on
 * save.
 */
export function useVideoLabelsIndex(
  stream: VideoFrameLabelsStream | null,
  fields: string[],
  dynamicAttributes: string[] = []
): VideoLabelsIndexState {
  const [state, setState] = useState<VideoLabelsIndexState>(EMPTY);
  const fieldsKey = fields.join(",");
  const dynamicKey = dynamicAttributes.join(",");

  useEffect(() => {
    if (!stream || fields.length === 0) {
      setState(EMPTY);
      return undefined;
    }

    let cancelled = false;
    setState(EMPTY);

    const { sampleId, dataset, view } = stream.labelQuery();

    void getVideoLabelsIndex({
      sampleId,
      dataset,
      view,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fieldsKey/dynamicKey capture the arrays
  }, [stream, fieldsKey, dynamicKey]);

  return state;
}
