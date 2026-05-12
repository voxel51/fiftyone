import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import React, { useRef } from "react";
import { isPlayingAtom, playheadAtom } from "../lib/playback-atoms";
import { usePlayback } from "../lib/PlaybackProvider";
import { PauseIcon, PlayIcon } from "./timeline-controls-icons";
import styles from "./SimplePlaybackBar.module.css";

function formatTime(t: number): string {
  const total = Math.max(0, Math.floor(t));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Live time/duration readout. Isolated so its playheadAtom subscription
 * doesn't re-render the play button or progress bar on every tick.
 */
const TimeReadout: React.FC = () => {
  const playhead = useAtomValue(playheadAtom);
  const { duration } = usePlayback();
  return (
    <Text
      variant={TextVariant.Xs}
      color={TextColor.Secondary}
      className={styles.time}
    >
      {`${formatTime(playhead)} / ${formatTime(duration)}`}
    </Text>
  );
};

/**
 * Click-or-drag scrub track. Subscribes to playheadAtom (re-renders on
 * every tick) but only renders a thin track, fill, and handle.
 */
const ProgressBar: React.FC = () => {
  const playhead = useAtomValue(playheadAtom);
  const { duration, seek } = usePlayback();
  const trackRef = useRef<HTMLDivElement>(null);

  const ratio = duration > 0 ? Math.max(0, Math.min(1, playhead / duration)) : 0;

  const seekFromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const r = Math.max(0, Math.min(1, x / rect.width));
    seek(r * duration);
  };

  return (
    <div
      ref={trackRef}
      className={styles.track}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        seekFromPointer(e.clientX);
      }}
      onPointerMove={(e) => {
        // Only scrub while the pointer is down (any button).
        if (e.buttons === 0) return;
        seekFromPointer(e.clientX);
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

export interface SimplePlaybackBarProps {
  className?: string;
}

/**
 * Minimal playback bar: play/pause button, current time / duration, and a
 * scrubbable progress bar. Designed to sit at the bottom of a video
 * surface — think basic YouTube player.
 */
const SimplePlaybackBar: React.FC<SimplePlaybackBarProps> = ({
  className,
}) => {
  const isPlaying = useAtomValue(isPlayingAtom);
  const { play, pause } = usePlayback();
  return (
    <div className={clsx(styles.root, className)}>
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
      <TimeReadout />
      <ProgressBar />
    </div>
  );
};

export default SimplePlaybackBar;
