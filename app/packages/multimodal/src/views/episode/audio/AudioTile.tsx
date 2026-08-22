import { TimelineRuler, useAudio } from "@fiftyone/playback";
import {
  useSetTileHeaderExtra,
  useSetTileTitle,
  useTileId,
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
import React, { useEffect, useMemo, useState } from "react";
import {
  useAudioSourceState,
  useRequestAudio,
} from "../../../audio/audio-source-registry";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { useSceneSourcesByType } from "../../../scene-inventory/react";
import type { EpisodeTileProps } from "../tiles/tile-types";
import { channelLabel, synthesizePeaks } from "../../../audio/peak-pyramid";
import { useRegisterTileSettings } from "../tiles/tile-settings-context";
import AudioTileSettings from "./AudioTileSettings";
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
const AudioTile: React.FC<EpisodeTileProps> = ({ initialSourceId }) => {
  const sources = useSceneSourcesByType(SCENE_SOURCE_TYPE.AUDIO);
  const tileId = useTileId();

  // Bound once, then user-switchable. This tile used to read `sources[0]`
  // and offer no way to change it, so a recording with several audio topics
  // could only ever show the first one — and the `initialSourceId` the host
  // passes when a tile is opened for a specific source was ignored outright.
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(
    () => initialSourceId ?? sources[0]?.id,
  );
  // A source can disappear between recordings; fall back rather than bind to
  // an id the inventory no longer has.
  const primarySourceId =
    sources.find((source) => source.id === selectedSourceId)?.id ??
    sources[0]?.id;
  const primarySource = sources.find((source) => source.id === primarySourceId);
  const setTileTitle = useSetTileTitle();
  const setHeaderExtra = useSetTileHeaderExtra();
  const { tracks, registerAudioTrack, masterMuted } = useAudio();

  useEffect(() => {
    setTileTitle("Audio", { source: "auto" });
  }, [setTileTitle]);

  // Opening this tile is a request for the source's audio: it needs decoded
  // samples to draw a waveform even when nothing is audible.
  useRequestAudio(primarySourceId ?? "");

  // Observe, don't read. `RegisterMcapAudioStreams` owns the single reader
  // per source and publishes what it finds. This tile used to start its own
  // `useMcapAudioStream` with `playback: false` — which avoided a second
  // audio graph but not a second reader, and with playback off it used the
  // unlimited discard sink, so it scanned toward the end of the source
  // purely to build peaks. Opening the panel could become a whole-recording
  // fetch on top of the one already running.
  const pcm = useAudioSourceState(primarySourceId ?? "");

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

  const settingsRegistration = useMemo(
    () => ({
      content: (
        <AudioTileSettings
          onSelectSource={setSelectedSourceId}
          sourceId={primarySourceId}
          sources={sources}
        />
      ),
    }),
    [primarySourceId, sources],
  );
  useRegisterTileSettings(tileId, settingsRegistration);

  // Synthetic fallback only for the placeholder path (no real source) or
  // while a real source hasn't produced peaks yet — computed once, not
  // per render, since it's a ~480k-sample buffer.
  const placeholderPyramid = useMemo(
    () => synthesizePeaks({ durationSec: 10 }),
    [],
  );

  // One waveform row per channel (L above R), so stereo reads honestly
  // instead of collapsing both channels into a single mixed trace. The row
  // label names the channel only — the source is named once in the header
  // above, and repeating it per row just pushed the channel off the end.
  const waveformTracks = useMemo<WaveformTrackSpec[]>(() => {
    const pyramids = pcm.waveformPeaks ?? [placeholderPyramid];
    return pyramids.map((pyramid, index) => ({
      trackId: `${boundTrackId}:${index}`,
      label: channelLabel(index, pyramids.length),
      pyramid,
    }));
  }, [boundTrackId, pcm.waveformPeaks, placeholderPyramid]);

  // Silence has several distinct causes (still decoding, unsupported
  // codec, this track muted, master muted) and they're indistinguishable
  // from "broken" without saying which — so name the actual reason.
  const statusCaption = !primarySourceId
    ? "Waveform (placeholder — no audio source selected)"
    : pcm.status === "idle"
      ? "No audio decoded from this source"
      : pcm.status === "loading"
        ? "Decoding…"
        : pcm.status === "unsupported"
          ? "Audio codec not supported by this browser"
          : pcm.status === "error"
            ? "Failed to decode audio"
            : boundTrack?.muted
              ? "Muted (this track)"
              : masterMuted
                ? "Muted (master volume)"
                : "Ready";

  return (
    <Stack className={styles.root} data-testid="audio-tile">
      <div className={styles.metadata} data-testid="audio-tile-metadata">
        {/* The source's own name. This used to render `waveformTracks[0]`'s
            label, which had the channel suffix appended — so a stereo
            source's header read "…/mic_front L". */}
        <Text color={TextColor.Primary} variant={TextVariant.Sm}>
          {primarySource?.label ?? "Audio"}
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
