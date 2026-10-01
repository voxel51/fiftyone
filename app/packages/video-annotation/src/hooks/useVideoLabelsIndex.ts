import { useEffect, useMemo, useState } from "react";
import {
  getVideoLabelsIndex,
  type VideoLabelIndexInstance,
  type VideoLabelMemberIndexInstance,
} from "../../../core/src/client/videoLabelsClient";
import { useDynamicGroupMemberIndex } from "../state/dynamicGroupMemberIndex";
import type { IndexInstance } from "../tracks/frameTracks";
import {
  frameNumbersByMember,
  isMemberIndexInstance,
  toFrameIndexInstances,
} from "../tracks/memberIndexInstances";
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
  /**
   * A dynamic group's index, keyed by member sample; `null` for a video
   * sample. Frame runs come from the group's member order once it loads.
   */
  memberIndexByPath: Record<string, VideoLabelMemberIndexInstance[]> | null;
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
  // Serialized, not joined: a field name may itself contain a delimiter, and a
  // colliding key would let a previous answer pass as the current one.
  const key = JSON.stringify([fields, dynamicAttributes]);
  const [state, setState] = useState<StoredIndexState>({
    ...EMPTY,
    stream: null,
    key,
    memberIndexByPath: null,
  });

  useEffect(() => {
    if (!stream || fields.length === 0) {
      setState({ ...EMPTY, stream, key, memberIndexByPath: null });
      return undefined;
    }

    let cancelled = false;
    setState({ ...EMPTY, stream, key, memberIndexByPath: null });

    const { sampleId, dataset, view, dynamicGroup } = stream.labelQuery();
    // 0 and "" are legitimate group values; only null/undefined means none
    const isDynamicGroup = dynamicGroup != null;

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
        const memberIndexByPath: Record<
          string,
          VideoLabelMemberIndexInstance[]
        > = {};
        for (const path of fields) {
          const instances: Array<
            VideoLabelIndexInstance | VideoLabelMemberIndexInstance
          > = response[toPerFrameField(path)]?.instances ?? [];
          if (isDynamicGroup) {
            memberIndexByPath[path] = instances.filter(isMemberIndexInstance);
          } else {
            indexByPath[path] = instances.filter(
              (instance) => !isMemberIndexInstance(instance),
            );
          }
        }

        setState({
          indexByPath,
          loaded: true,
          stream,
          key,
          memberIndexByPath: isDynamicGroup ? memberIndexByPath : null,
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setState({
          indexByPath: {},
          loaded: true,
          stream,
          key,
          memberIndexByPath: null,
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the arrays
  }, [stream, key]);

  // Answer only for the CURRENT inputs — see `StoredIndexState`.
  const current = state.stream === stream && state.key === key;

  const memberIndex = useDynamicGroupMemberIndex();
  const frameOf = useMemo(
    () => (memberIndex ? frameNumbersByMember(memberIndex) : null),
    [memberIndex],
  );

  return useMemo(() => {
    if (!current) {
      return EMPTY;
    }

    const { memberIndexByPath } = state;
    if (!memberIndexByPath) {
      return { indexByPath: state.indexByPath, loaded: state.loaded };
    }

    // A dynamic group's index maps onto frames through its member order,
    // which loads separately
    if (!frameOf) {
      return EMPTY;
    }

    const indexByPath: Record<string, IndexInstance[]> = {};
    for (const [path, instances] of Object.entries(memberIndexByPath)) {
      indexByPath[path] = toFrameIndexInstances(instances, frameOf);
    }

    return { indexByPath, loaded: state.loaded };
  }, [current, state, frameOf]);
}
