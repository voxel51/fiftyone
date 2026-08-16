import { TimelineRuler, useAudio } from "@fiftyone/playback";
import {
  useSetTileHeaderExtra,
  useSetTileTitle,
} from "@fiftyone/tiling";
import {
  Button,
  IconName,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useEffect, useMemo } from "react";
import { usePCMAudioStream } from "../../../adapters/mcap/resource-client/use-pcm-audio-stream";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import type { EpisodeTileProps } from "../tiles/tile-types";
import { synthesizePeaks } from "./peak-pyramid";
import styles from "./AudioTile.module.css";
import WaveformSurface from "./WaveformSurface";
import { type WaveformTrackSpec } from "./WaveformViewer";

/**
 * Audio tile: metadata header + waveform viewer for one or more audio
 * scene sources. `sourceTypes` won't include `SCENE_SOURCE_TYPE.AUDIO`
 * for any real MCAP file until the Phase 2 Foxglove RawAudio/
 * CompressedAudio decoders land (see plan §9) — this tile is reachable
 * and renders today against SYNTHETIC placeholder peak data so the
 * WebGPU rendering path, ruler, and tile-header mute button can all be
 * verified before that decode work exists.
 */
const AudioTile: React.FC<EpisodeTileProps> = () => {
  const sources = useSceneSourcesByType(SCENE_SOURCE_TYPE.AUDIO);
  const primarySourceId = sources[0]?.id;
  const setTileTitle = useSetTileTitle();
  const setHeaderExtra = useSetTileHeaderExtra();
  const { tracks, registerAudioTrack, masterMuted } = useAudio();

  useEffect(() => {
    setTileTitle("Audio", { source: "auto" });
  }, [setTileTitle]);

  // Real decode path: this registers the track (id = the source's stream
  // id) and drives actual Web Audio playback once decoded. Passing "" when
  // there's no real source yet is harmless — the hook just never resolves
  // any frames for an empty stream id.
  // Waveform only: `RegisterMcapAudioStreams` owns audible playback for
  // every audio source, so this instance must not build a second audio
  // graph for the same stream (see `UsePCMAudioStreamOptions.playback`).
  const pcm = usePCMAudioStream(primarySourceId ?? "", { playback: false });

  // Placeholder path: no real audio scene source exists yet (e.g. this
  // tile was added manually before Phase 2 decoding produced one, or in a
  // dev/story context) — register a synthetic track so the tile, ruler,
  // and mute button stay exercisable rather than rendering nothing.
  const placeholderTrackId = "audio-placeholder";
  useEffect(() => {
    if (primarySourceId) return undefined;
    return registerAudioTrack({
      id: placeholderTrackId,
      label: "Audio (placeholder)",
      kind: "native-element",
    });
  }, [primarySourceId, registerAudioTrack]);

  const boundTrackId = primarySourceId ?? placeholderTrackId;
  const boundTrack = tracks.find((track) => track.id === boundTrackId);

  // Publish the mute button into this tile's own header — every other
  // tile type never calls this setter, so their headers are unaffected.
  useEffect(() => {
    if (!boundTrack) {
      setHeaderExtra(null);
      return undefined;
    }
    setHeaderExtra(
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="audio-tile-header-mute"
        leadingIcon={boundTrack.muted ? IconName.VolumeOff : IconName.VolumeUp}
        aria-label={boundTrack.muted ? "Unmute" : "Mute"}
        aria-pressed={boundTrack.muted}
        onClick={() => boundTrack.setMuted(!boundTrack.muted)}
      />,
    );
    return () => setHeaderExtra(null);
  }, [boundTrack, setHeaderExtra]);

  // Synthetic fallback only for the placeholder path (no real source) or
  // while a real source hasn't produced peaks yet — computed once, not
  // per render, since it's a ~480k-sample buffer.
  const placeholderPyramid = useMemo(() => synthesizePeaks({ durationSec: 10 }), []);

  const waveformTracks = useMemo<WaveformTrackSpec[]>(() => {
    const label = sources[0]?.label ?? "Audio";
    return [
      {
        trackId: boundTrackId,
        label,
        pyramid: pcm.waveformPeaks ?? placeholderPyramid,
      },
    ];
  }, [boundTrackId, sources, pcm.waveformPeaks, placeholderPyramid]);

  // Silence has several distinct causes (still decoding, unsupported
  // codec, this track muted, master muted) and they're indistinguishable
  // from "broken" without saying which — so name the actual reason.
  const statusCaption = !primarySourceId
    ? "Waveform (placeholder — no audio source selected)"
    : pcm.decodeStatus === "idle"
      ? "No audio decoded from this source"
      : pcm.decodeStatus === "loading"
        ? "Decoding…"
        : pcm.decodeStatus === "unsupported"
          ? "Audio codec not supported by this browser"
          : pcm.decodeStatus === "error"
            ? "Failed to decode audio"
            : boundTrack?.muted
              ? "Muted (this track)"
              : masterMuted
                ? "Muted (master volume)"
                : "Ready";

  return (
    <Stack className={styles.root} data-testid="audio-tile">
      <div className={styles.metadata}>
        <Text color={TextColor.Primary} variant={TextVariant.Sm}>
          {waveformTracks[0]?.label}
        </Text>
        <Text
          color={TextColor.Secondary}
          data-testid="audio-tile-status"
          variant={TextVariant.Caption}
        >
          {statusCaption}
        </Text>
      </div>
      <TimelineRuler className={styles.ruler} />
      <WaveformSurface className={styles.waveform} tracks={waveformTracks} />
    </Stack>
  );
};

export default AudioTile;
