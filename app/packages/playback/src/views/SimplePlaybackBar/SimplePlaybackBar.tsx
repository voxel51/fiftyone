import { Button, Size, Variant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import React from "react";
import { isPlayingAtom, playheadAtom } from "../../lib/playback/atoms";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import PlayheadTime from "../Playhead/PlayheadTime";
import { PauseIcon, PlayIcon } from "../TimelineControls/timeline-controls-icons";
import styles from "./SimplePlaybackBar.module.css";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Click-or-drag scrub track. Subscribes to playheadAtom (re-renders on
 * every tick) but only renders a thin track, fill, and handle. Children
 * use `pointer-events: none` so the pointer event's `offsetX` is always
 * measured relative to the track itself.
 */
const ProgressBar: React.FC = () => {
  const playhead = useAtomValue(playheadAtom);
  const { duration, seek } = usePlayback();

  const ratio = duration > 0 ? clamp(playhead / duration, 0, 1) : 0;

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const width = e.currentTarget.clientWidth;
    if (width <= 0) return;
    const r = clamp(e.nativeEvent.offsetX / width, 0, 1);
    seek(r * duration);
  };

  return (
    <div
      className={styles.track}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromPointer(e);
      }}
      onPointerMove={(e) => {
        // Only scrub while the pointer is down (any button).
        if (e.buttons === 0) return;
        seekFromPointer(e);
      }}
    >
      <div className={styles.rail} />
      <div
        className={styles.fill}
        style={{ width: `calc(${ratio * 100}% - 0px)`, height: 3 }}
      />
      <div className={styles.handle} style={{ left: `${ratio * 100}%` }} />
    </div>
  );
};

/**
 * Minimal playback bar: play/pause button, current time / duration, and a
 * scrubbable progress bar. Designed to sit at the bottom of a video
 * surface — think basic YouTube player.
 */
const SimplePlaybackBar: React.FC = () => {
  const isPlaying = useAtomValue(isPlayingAtom);
  const { play, pause } = usePlayback();
  return (
    <div className={styles.root}>
      <Button
        variant={Variant.Borderless}
        size={Size.Xs}
        // React 18/19 type mismatch on FC<{}>.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leadingIcon={(isPlaying ? PauseIcon : PlayIcon) as any}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause" : "Play"}
      />
      <PlayheadTime />
      <ProgressBar />
    </div>
  );
};

export default SimplePlaybackBar;
