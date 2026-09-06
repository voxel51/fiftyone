/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  useActiveSampleId,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
import type { Track } from "@fiftyone/playback";
import type { LabelData, LabelType } from "@fiftyone/utilities";
import { useCallback, useMemo } from "react";
import { useVideoLabelsIndex } from "../hooks/useVideoLabelsIndex";
import {
  useFrameLabelFields,
  useVisibleLabelSchemas,
} from "../state/accessors";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import {
  buildTracksFromIndex,
  type FrameOverlay,
  type PerInstanceLabel,
} from "./frameTracks";

/** Resolves the row color for a per-frame object track. */
export type ObjectTrackColorResolver = (
  label: PerInstanceLabel,
  path: string,
) => string;

/**
 * Build the per-instance object tracks from the server distribution index
 * merged with the engine's edited-frame overlay — no whole-clip walk.
 * `resolved` flips true once the index settles, gating the pin bootstrap.
 */
export function useFrameDerivedTracks(
  resolveColor: ObjectTrackColorResolver,
  getDynamicAttributes: (path: string | null) => string[],
  /**
   * Explore's per-frame field set, when this is driving the Explore surface.
   *
   * Both gates below derive from the annotation schemas by default, and
   * neither is populated in Explore unless the Schema Manager happens to have
   * activated them: `useFrameLabelFields` knows only Detections and Polylines,
   * and `useVisibleLabelSchemas` is annotation-active ∩ explore-active, which
   * is empty when the first half is. That left Explore showing no frame-label
   * tracks at all. When this is supplied it IS the visible set — the sidebar's
   * active paths are exactly what Explore means by visible.
   */
  exploreLabelTypes?: Record<string, LabelType>,
): {
  tracks: Track[];
  resolved: boolean;
} {
  const stream = useFrameLabelsStream();
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const annotationVisible = useVisibleLabelSchemas();
  const annotationLabelTypes = useFrameLabelFields();

  const labelTypes = exploreLabelTypes ?? annotationLabelTypes;
  const explicitVisible = useMemo(
    () => (exploreLabelTypes ? new Set(Object.keys(exploreLabelTypes)) : null),
    [exploreLabelTypes],
  );
  const visible = explicitVisible ?? annotationVisible;

  // Fetch the index for every declared frame label field (stable per dataset/
  // view) so visibility toggles filter client-side without re-fetching.
  const allFields = useMemo(() => Object.keys(labelTypes), [labelTypes]);

  // Each field's declared dynamic attributes, scoped per path so a field
  // without dynamic attributes gets no sub-tracks.
  const dynamicByPath = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const path of allFields) {
      map[path] = getDynamicAttributes(path);
    }
    return map;
  }, [allFields, getDynamicAttributes]);

  // The fetch takes the union across fields — the backend returns attribute
  // segments only for the fields that actually declare each attribute.
  const allDynamicAttributes = useMemo(
    () => Array.from(new Set(Object.values(dynamicByPath).flat())),
    [dynamicByPath],
  );

  // Gate each frame field's tracks on the sidebar's visible set — deactivating
  // a field in the schema manager hides its timeline rows, matching the canvas
  // + sidebar.
  const paths = useMemo(
    () => allFields.filter((p) => visible.has(p)),
    [allFields, visible],
  );

  const { indexByPath, loaded } = useVideoLabelsIndex(
    stream,
    allFields,
    allDynamicAttributes,
  );

  // No visible frame field, or the index hasn't settled: no rows. Tracks build
  // per visible field from that field's index ⊕ its dirty-frame overlay, then
  // concatenate — instance ids are unique across fields, so the rows just merge.
  //
  // Selected through the engine (version bumps re-run the read) with
  // structural equality, NOT re-rendered per raw version: label ingest —
  // chunk warmup, stream re-seeds — bumps the display version with
  // track-identical results, and a raw-version subscription re-rendered the
  // entire timeline subtree on every bump. Only a rebuild that actually moves
  // a row reaches React.
  // Memoized rather than inline: `useEngineSelector` caches by the selector's
  // OWN identity as well as the engine's version (its doc comment: "an inline
  // closure captures fresh props each render"), so a fresh closure every
  // render defeats that cache entirely — every render re-walks every visible
  // field's index and rebuilds every track, even when nothing in the engine
  // changed. `tracksEqual` below still gates the re-RENDER; this is what lets
  // it also gate the (much more expensive) rebuild.
  const selectTracks = useCallback(() => {
    if (!stream || !sampleId || !loaded || paths.length === 0) {
      return EMPTY_TRACKS;
    }

    return paths.flatMap((path) =>
      buildTracksFromIndex({
        path,
        index: indexByPath[path] ?? [],
        overlay: readEngineOverlay(engine, sampleId, path),
        fps: stream.fps,
        resolveColor,
        dynamicAttributes: dynamicByPath[path] ?? [],
      }),
    );
  }, [
    engine,
    stream,
    sampleId,
    loaded,
    paths,
    indexByPath,
    resolveColor,
    dynamicByPath,
  ]);

  const tracks = useEngineSelector(engine, selectTracks, tracksEqual);

  return { tracks, resolved: loaded };
}

const EMPTY_TRACKS: Track[] = [];

/**
 * Structural equality over rebuilt rows. Track/event payloads are plain JSON
 * data (`ObjectTrackEventData`, attribute segment values), so serialized
 * comparison is exact.
 */
export function tracksEqual(a: Track[], b: Track[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }

  return a.every((track, i) => {
    const other = b[i];
    return (
      track.id === other.id && JSON.stringify(track) === JSON.stringify(other)
    );
  });
}

/**
 * The engine's materialized frames + their live labels, keyed by frame number —
 * the overlay that shadows the server index. Reads every loaded frame, not just
 * the dirty set: a successful autosave folds edits into the seed and clears the
 * dirty set, so a dirty-only overlay would revert the timeline to the stale
 * index after each save. The engine is authoritative for every frame it holds,
 * so overlaying all of them keeps the timeline correct post-save and composes
 * index (unloaded) ⊕ engine (loaded window) once the seed is windowed. Bounded
 * by the loaded window, which today is the whole clip (see `warmupAll`).
 */
function readEngineOverlay(
  engine: ReturnType<typeof useAnnotationEngine>,
  sample: string,
  path: string,
): FrameOverlay {
  const overlay: FrameOverlay = new Map<number, LabelData[]>();

  for (const frame of engine.loadedFrames(sample)) {
    overlay.set(frame, engine.listLabels({ sample, path, frame }));
  }

  return overlay;
}
