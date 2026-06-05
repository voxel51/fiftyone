import { getLabelColorFromContext } from "@fiftyone/lighter";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useColorScheme, useColorSeed } from "../state/accessors";
import { usePlayback } from "../../../playback/src/lib/playback/PlaybackProvider";
import { useDuration } from "../../../playback/src/lib/playback/use-playback-state";
import { usePlaybackStream } from "../../../playback/src/lib/playback/use-playback-stream";
import { TrackProvider } from "../../../playback/src/lib/tracks/TrackProvider";
import TimelineWithTracks from "../../../playback/src/views/TimelineWithTracks/TimelineWithTracks";
import { LABELS_STREAM_ID } from "../utils/ids";
import { useLinkedTrackDecorator } from "../tracks/linkedTracks";
import {
  DEFAULT_ACTOR_SPECS,
  resolveActor,
  SyntheticLabelStream,
} from "../streams/SyntheticLabelStream";
import {
  buildSyntheticTracks,
  type SyntheticActorLabel,
} from "../tracks/syntheticTracks";

// todo - hardcoded for demo
export const SYNTHETIC_FIELD = "synthetic_detections";
export const SYNTHETIC_FPS = 30;

/**
 * Synthetic labels stream — used for testing the rendering path without
 * real labels. Mirrors the lifecycle of `RegisterFrameLabels`:
 * construct once, push actors in once duration is known, nudge `seek(0)`.
 */
export const RegisterSyntheticLabels: React.FC = () => {
  const duration = useDuration();
  const { seek } = usePlayback();

  const streamRef = useRef<SyntheticLabelStream | null>(null);
  if (streamRef.current === null) {
    streamRef.current = new SyntheticLabelStream(LABELS_STREAM_ID, {
      fps: SYNTHETIC_FPS,
    });
  }
  usePlaybackStream(streamRef.current);

  useEffect(() => {
    if (duration <= 0) {
      return;
    }

    const actors = DEFAULT_ACTOR_SPECS.map((spec) =>
      resolveActor(spec, duration)
    );
    streamRef.current!.setActors(actors);
    seek(0);
  }, [duration, seek]);

  return null;
};

/**
 * Synthetic track timeline — one row per actor with the color resolved
 * against the same color scheme the overlays use. Mirrors
 * `FrameLabelsTracks`: live recolor through the reactive `tracks` prop,
 * plus a one-shot empty→ready key flip so `initialPinnedIds` bootstraps
 * when the real track list lands.
 */
export const SyntheticTrackTimeline: React.FC = () => {
  const duration = useDuration();
  const scheme = useColorScheme();
  const seed = useColorSeed();

  const resolveColor = useCallback(
    (label: SyntheticActorLabel) =>
      getLabelColorFromContext(SYNTHETIC_FIELD, label, {
        colorScheme: scheme,
        seed,
      }),
    [scheme, seed]
  );

  const actors = useMemo(
    () =>
      duration > 0
        ? DEFAULT_ACTOR_SPECS.map((spec) => resolveActor(spec, duration))
        : [],
    [duration]
  );

  const tracks = useMemo(
    () => buildSyntheticTracks(actors, duration, resolveColor),
    [actors, duration, resolveColor]
  );

  const pinned = useMemo(() => tracks.map((t) => t.id), [tracks]);
  const ready = tracks.length > 0;
  const decorateTrack = useLinkedTrackDecorator();

  return (
    <TrackProvider
      key={ready ? "ready" : "init"}
      tracks={tracks}
      initialPinnedIds={pinned}
    >
      <TimelineWithTracks decorateTrack={decorateTrack} />
    </TrackProvider>
  );
};
