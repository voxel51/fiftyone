import { Button, Size, Variant } from "@voxel51/voodo";
import React from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  useIsPlaying,
  usePlayhead,
} from "../../lib/playback/use-playback-state";
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
  const playhead = usePlayhead();
  const { duration, seek } = usePlayback();

  const ratio = duration > 0 ? clamp(playhead / duration, 0, 1) : 0;

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const width = e.currentTarget.clientWidth;
    if (width <= 0) return;
    const r = clamp(e.nativeEvent.offsetX / width, 0, 1);
    seek(r * duration);
  };

  // Standard slider-role keyboard support: arrows = ±1%, PageUp/Down =
  // ±10%, Home/End = jump to ends.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    const step = duration / 100;
    const pageStep = duration / 10;
    let next = playhead;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = clamp(playhead + step, 0, duration);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = clamp(playhead - step, 0, duration);
        break;
      case "PageUp":
        next = clamp(playhead + pageStep, 0, duration);
        break;
      case "PageDown":
        next = clamp(playhead - pageStep, 0, duration);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = duration;
        break;
      default:
        return;
    }
    e.preventDefault();
    seek(next);
  };

  return (
    <div
      className={styles.track}
      data-testid="simple-playback-bar-track"
      role="slider"
      aria-label="Scrub"
      aria-valuemin={0}
      aria-valuemax={duration > 0 ? duration : 0}
      aria-valuenow={playhead}
      aria-valuetext={`${playhead.toFixed(2)} of ${duration.toFixed(2)} seconds`}
      tabIndex={duration > 0 ? 0 : -1}
      onKeyDown={onKeyDown}
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
      <div className={styles.fill} style={{ width: `${ratio * 100}%` }} />
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
  const isPlaying = useIsPlaying();
  const { play, pause } = usePlayback();
  return (
    <div className={styles.root}>
      <Button
        variant={Variant.Borderless}
        size={Size.Xs}
        data-testid="simple-playback-bar-play-pause"
        // React 18/19 type mismatch on FC<{}>.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leadingIcon={(isPlaying ? PauseIcon : PlayIcon) as any}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
        aria-pressed={isPlaying}
        title={isPlaying ? "Pause" : "Play"}
      />
      <PlayheadTime />
      <ProgressBar />
    </div>
  );
};

export default SimplePlaybackBar;
