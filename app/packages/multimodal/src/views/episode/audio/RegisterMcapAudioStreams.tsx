import {
  useAudio,
  useIsPlaying,
  usePlaybackStore,
  setAudioAvailable,
} from "@fiftyone/playback";
import React, { useEffect, useState } from "react";

import {
  useAudioDemanded,
  usePublishAudioSourceState,
} from "../../../audio/audio-source-registry";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useOptionalSceneSourcesByType } from "../../../scene-inventory/react";
import { useMcapAudioStream } from "./use-mcap-audio-stream";

/**
 * Owns one audio scene source — a component per source so a dynamic-length
 * source list doesn't violate the rules of hooks (can't call a variable
 * number of hooks in a loop).
 *
 * Presence and demand are deliberately separate here. The mixer row is
 * registered unconditionally, because advertising that a recording has audio
 * costs nothing and is what keeps the volume and mixer controls reachable
 * without an Audio tile. Reading and decoding start only once something
 * actually wants the samples.
 *
 * Demand is either of:
 *   - some consumer asked for it, e.g. an open Audio tile drawing a
 *     waveform (`useRequestAudio`);
 *   - the track is audible AND this recording has actually been played.
 *
 * Audibility alone is not demand. Master mute is sessionStorage-scoped and
 * deliberately survives sample changes (see `audioMutedAtom`), so treating
 * it as demand meant arriving at a new recording with a stale unmute
 * eagerly decoded every source before anyone asked to hear anything — and
 * an unmuted track stayed enabled after its tile closed. Pairing it with
 * "has played" keeps the no-tile listening path working while scoping it to
 * a recording the user actually started.
 *
 * The play latch is deliberately sticky rather than tracking `isPlaying`
 * directly: releasing on every pause would drop the decoded buffer and
 * force a re-decode on resume. It resets naturally per sample, since each
 * sample mounts a fresh provider store and remounts this component.
 */
const AudioSourceRegistrar: React.FC<{
  sourceId: string;
  label: string;
}> = ({ sourceId, label }) => {
  const { masterMuted, tracks } = useAudio();

  const trackMuted =
    tracks.find((track) => track.id === sourceId)?.muted ?? false;
  const audible = !masterMuted && !trackMuted;
  const requested = useAudioDemanded(sourceId);

  // Sticky: latches on the first play of this recording and stays set for
  // the life of the mount. See the note above on why this is not `isPlaying`.
  const isPlaying = useIsPlaying();
  const [hasPlayed, setHasPlayed] = useState(false);
  useEffect(() => {
    if (isPlaying) setHasPlayed(true);
  }, [isPlaying]);

  const enabled = requested || (audible && hasPlayed);

  // No presence registration here. `useMcapAudioStream` mounts
  // `useAudioPlayback` unconditionally, and that registers the mixer row on
  // `trackId` alone — it does not wait for a decode and does not care
  // whether anything is reading. So the row already exists whether or not
  // this source is enabled, and `useAudio()` derives master availability
  // from the roster being non-empty. An extra registration here keyed on
  // `enabled` only re-registered the row on every mute, moving it.

  // Pass the scene-source label through: without it the mixer row and tile
  // header fall back to the raw stream id ("0", "1").
  const state = useMcapAudioStream(sourceId, { enabled, label });

  // Republish for observers (the Audio tile's waveform) so opening a tile
  // does not have to start a second reader over the same source.
  usePublishAudioSourceState(sourceId, state);

  return null;
};

/**
 * TEMPORARY stub: when a scene has no real audio scene source yet (no
 * decoder support for the file's encoding, e.g. JSON-encoded
 * `foxglove.RawAudio`), register one synthetic placeholder track anyway so
 * the master volume control, the Mixed dropdown, and the main-timeline
 * audio row are all reachable/testable in a real browser before the real
 * decode path is debugged. Remove once every real audio source classifies
 * and decodes correctly end to end.
 */
const StubAudioTrack: React.FC = () => {
  const store = usePlaybackStore();
  const { registerAudioTrack } = useAudio();
  useEffect(() => {
    setAudioAvailable(store, "available");
    const unregister = registerAudioTrack({
      id: "audio-stub",
      label: "Audio (stub)",
      kind: "native-element",
    });
    return () => {
      unregister();
      setAudioAvailable(store, "unavailable");
    };
  }, [store, registerAudioTrack]);
  return null;
};

/**
 * Ambient audio registrar for the MCAP scene viewer — mirrors
 * `video-annotation`'s `RegisterTimelineAudio`, which mounts unconditionally
 * alongside the video so native audio plays/mixes regardless of which tile
 * (if any) is open. Without this, `useMcapAudioStream()` only ever ran
 * inside a manually-added Audio tile, so a recording with real audio
 * topics would show no volume/mixer controls at all until a user happened
 * to add that tile.
 *
 * Mount as a `PlaybackShell` child (see `SourcePlayback.tsx`) — that's
 * inside `PlaybackProvider`/`SceneInventoryProvider`, and `DataStreamProvider`
 * wraps `PlaybackShell` from the outside in `SourcePlayback.tsx`, so both
 * `useSceneSourcesByType` and `useMcapAudioStream`'s `useDataStream()` are
 * available here.
 */
const RegisterMcapAudioStreams: React.FC = () => {
  // Optional inventory: this registrar mounts unconditionally beside every
  // scene, including shells rendered without a `SceneInventoryProvider`
  // (tests, bootstrap states). With no inventory there is simply no audio
  // to register — it must not take the shell down.
  const sources = useOptionalSceneSourcesByType(SCENE_SOURCE_TYPE.AUDIO);
  return (
    <>
      {sources.length === 0 ? (
        <StubAudioTrack />
      ) : (
        sources.map((source) => (
          <AudioSourceRegistrar
            key={source.id}
            label={source.label}
            sourceId={source.id}
          />
        ))
      )}
    </>
  );
};

export default RegisterMcapAudioStreams;
