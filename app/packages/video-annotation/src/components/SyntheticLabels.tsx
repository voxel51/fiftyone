import { getLabelColorFromContext } from "@fiftyone/lighter";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useColorScheme, useColorSeed } from "../state/accessors";
import {
  TimelineWithTracks,
  TrackProvider,
  useDuration,
  usePlayback,
  usePlaybackStream,
} from "@fiftyone/playback";
import { LABELS_STREAM_ID } from "../utils/ids";
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
 * Synthetic labels stream — exercises the rendering path without real labels.
 * Constructs the stream once, pushes actors in once duration is known, and
 * nudges `seek(0)`.
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

  const stream = streamRef.current;
  usePlaybackStream(stream);

  useEffect(() => {
    if (duration <= 0) {
      return;
    }

    const actors = DEFAULT_ACTOR_SPECS.map((spec) =>
      resolveActor(spec, duration)
    );
    stream.setActors(actors);
    seek(0);
  }, [stream, duration, seek]);

  return null;
};

/**
 * Synthetic track timeline — one row per actor, colored against the same
 * color scheme the overlays use. Recolors live through the reactive `tracks`
 * prop, with a one-shot empty→ready key flip so `initialPinnedIds` bootstraps
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
  // Synthetic actors carry no engine identity, so rows have no interaction
  // linkage — render them undecorated.
  const decorateTrack = useCallback(() => ({}), []);

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
