import {
  createIndexedSequenceSession,
  SCENE_SOURCE_TYPE,
  SourcePlayback,
  STREAM_KIND,
  type IndexedSequenceStream,
} from "@fiftyone/multimodal/sequence";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useState } from "react";
import { useRelayEnvironment } from "react-relay";
import {
  createGroupSequencePageLoader,
  type PlaybackSlice,
} from "./group-sequence-pages";
import { DRAWABLE_LABEL_CLASSES } from "./label-annotations";
import { usePlaybackSliceNames } from "./use-group-playback";

type EpisodeSession = ReturnType<typeof createIndexedSequenceSession>;

/** Elements fetched per request. Small enough to start fast on a seek. */
const PAGE_SIZE = 24;
/** At most about 10 s of elements at 30 fps, and at most this many bytes. */
const MAX_RESIDENT_PAGES = 24;
const MAX_RESIDENT_BYTES = 256 * 1024 * 1024;

/**
 * Plays an ordered dynamic group on the episode playback shell instead of
 * paging through it: element `i` of the group is frame `i`, at the dataset's
 * dynamic-group frame rate. Each image slice is an image stream and each
 * drawable label field a label stream on it, fetched a page at a time.
 */
const GroupPlayback = () => {
  const environment = useRelayEnvironment();
  const dataset = fos.useCurrentDatasetName();
  const datasetId = fos.useCurrentDatasetId();
  const view = fos.useView();
  const dynamicGroup = fos.useGroupByFieldValue();
  const elementCount = fos.useElementsCount(true);
  const fps = fos.useDynamicGroupsTargetFrameRate();
  const groupField = fos.useGroupField();
  const gridSlice = fos.useGridGroupSlice();
  const modalSlice = fos.useModalGroupSlice();
  const mediaField = fos.useSelectedMediaFieldModal();
  const coloring = fos.useColoring();
  const sliceNames = usePlaybackSliceNames();
  const labelFields = useDrawableLabelFields();

  const slices = useMemo<PlaybackSlice[]>(
    () =>
      sliceNames.map((name) => {
        const prefix = name ?? "media";
        return {
          name,
          streamId: prefix,
          labelStreams: labelFields.map((field) => ({
            field,
            streamId: `${prefix}/${field}`,
          })),
        };
      }),
    [labelFields, sliceNames],
  );

  const streams = useMemo<IndexedSequenceStream[]>(
    () =>
      slices.flatMap((slice) => {
        const sliceLabel = slice.name ?? "Media";
        return [
          {
            id: slice.streamId,
            kind: STREAM_KIND.IMAGE,
            sceneSourceType: SCENE_SOURCE_TYPE.IMAGE,
            sourceName: sliceLabel,
          },
          ...slice.labelStreams.map(({ field, streamId }) => ({
            id: streamId,
            kind: STREAM_KIND.IMAGE_ANNOTATIONS,
            sceneSourceType: SCENE_SOURCE_TYPE.IMAGE_ANNOTATION,
            sourceName: slice.name ? `${field} (${slice.name})` : field,
          })),
        ];
      }),
    [slices],
  );

  const episodeId = `group:${dataset}:${dynamicGroup ?? ""}`;
  const referenceName =
    sliceNames.find((name) => name === modalSlice) ?? sliceNames[0] ?? null;
  const [session, setSession] = useState<EpisodeSession | null>(null);

  // This effect owns the session: one per group, view and slice set, so a
  // new group never shows the last group's cached pages.
  useEffect(() => {
    if (!dataset || dynamicGroup == null || elementCount <= 0) return undefined;
    const referenceSlice =
      slices.find((slice) => slice.name === referenceName) ?? slices[0];
    if (!referenceSlice) return undefined;

    const next = createIndexedSequenceSession({
      elementCount,
      episodeId,
      fps,
      loadPage: createGroupSequencePageLoader({
        coloring: {
          byField: coloring.by === "field",
          pool: coloring.pool,
          seed: coloring.seed,
        },
        dataset,
        dynamicGroup,
        environment,
        groupField,
        gridSlice,
        mediaField,
        otherSlices: slices.filter((slice) => slice !== referenceSlice),
        referenceSlice,
        view,
      }),
      maxResidentBytes: MAX_RESIDENT_BYTES,
      maxResidentPages: MAX_RESIDENT_PAGES,
      pageSize: PAGE_SIZE,
      streams,
    });
    setSession(next);
    return () => {
      next.dispose();
      setSession((current) => (current === next ? null : current));
    };
  }, [
    coloring,
    dataset,
    dynamicGroup,
    elementCount,
    environment,
    episodeId,
    fps,
    gridSlice,
    groupField,
    mediaField,
    referenceName,
    slices,
    streams,
    view,
  ]);

  const source = useMemo(() => ({ sourceId: episodeId, url: "" }), [episodeId]);

  return (
    <SourcePlayback
      fileName={dynamicGroup == null ? "" : String(dynamicGroup)}
      layoutScopeKey={datasetId ? `group-playback:${datasetId}` : undefined}
      session={session}
      source={source}
    />
  );
};

/** Sample-level label fields of a kind the playback overlay can draw. */
function useDrawableLabelFields(): string[] {
  const paths = fos.useLabelFields({ space: fos.State.SPACE.SAMPLE });
  const types = fos.useFieldTypes();
  return useMemo(
    () =>
      paths.filter((path) => {
        const docType = types.get(path)?.embeddedDocType ?? "";
        return DRAWABLE_LABEL_CLASSES.has(docType.split(".").pop() ?? "");
      }),
    [paths, types],
  );
}

export default GroupPlayback;
