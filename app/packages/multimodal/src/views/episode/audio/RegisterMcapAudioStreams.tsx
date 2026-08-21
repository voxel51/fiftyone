import {
  useAudio,
  usePlaybackStore,
  setAudioAvailable,
} from "@fiftyone/playback";
import React, { useEffect } from "react";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useOptionalSceneSourcesByType } from "../../../scene-inventory/react";
import { useMcapAudioStream } from "./use-mcap-audio-stream";

/**
 * Decodes and registers one audio scene source's `useMcapAudioStream()` —
 * a component per source so a dynamic-length source list doesn't violate
 * the rules of hooks (can't call a variable number of hooks in a loop).
 */
const AudioSourceRegistrar: React.FC<{
  sourceId: string;
  label: string;
}> = ({ sourceId, label }) => {
  // Pass the scene-source label through: without it the mixer row and tile
  // header fall back to the raw stream id ("0", "1").
  useMcapAudioStream(sourceId, { label });
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
