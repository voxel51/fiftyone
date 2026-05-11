import { usePlayback } from "../lib/PlaybackProvider";
import {
  isPlayingAtom,
  loopEndAtom,
  loopStartAtom,
  playheadAtom,
} from "../lib/playback-atoms";
import {
  BrandColor,
  Button,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import React, { useCallback } from "react";
import PauseSvg from "./svgs/pause.svg?react";
import PlaySvg from "./svgs/play.svg?react";
import styles from "./TimelineControls.module.css";

function formatTime(t: number): string {
  const s = Math.floor(t);
  const cs = Math.floor((t - s) * 100);
  return `0:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function fmtBound(t: number): string {
  return `${t.toFixed(2)}s`;
}

const EPSILON = 0.02;

export interface TimelineControlsProps {
  className?: string;
  style?: React.CSSProperties;
}

const TimelineControls: React.FC<TimelineControlsProps> = ({
  className,
  style,
}) => {
  const currentTime = useAtomValue(playheadAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const loopStart = useAtomValue(loopStartAtom);
  const loopEnd = useAtomValue(loopEndAtom);
  const { duration, play, pause, stepBack, stepForward, setLoop } =
    usePlayback();

  const hasLoop = duration !== undefined;
  const atStart = hasLoop && loopStart < EPSILON;
  const atEnd = hasLoop && loopEnd > duration - EPSILON;
  const loopMoved = hasLoop && (!atStart || !atEnd);

  const onLoopStartReset = useCallback(
    () => setLoop(0, loopEnd),
    [setLoop, loopEnd]
  );
  const onLoopEndReset = useCallback(
    () => setLoop(loopStart, duration),
    [setLoop, loopStart, duration]
  );

  return (
    <div
      className={clsx(styles.root, className)}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={IconName.ArrowLeft}
        aria-label="Step back"
        onClick={stepBack}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        // SVG imports come from a React 18 instance; voodo Button expects React 19 FC.
        // TODO: add Play/Pause to the design-system IconName so no cast is needed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leadingIcon={(isPlaying ? PauseSvg : PlaySvg) as any}
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={isPlaying ? pause : play}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        leadingIcon={IconName.ArrowRight}
        aria-label="Step forward"
        onClick={stepForward}
      />

      <Text
        variant={TextVariant.Xs}
        color={TextColor.Secondary}
        className={styles.time}
      >
        {formatTime(currentTime)}
      </Text>

      {loopMoved && (
        <>
          <span className={styles.divider} aria-hidden />
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Secondary}
            className={styles.loopBounds}
          >
            {"("}
            <Text
              variant={TextVariant.Xs}
              color={atStart ? BrandColor.Primary : TextColor.Secondary}
              className={styles.loopBound}
              onClick={onLoopStartReset}
              title="Reset loop start to 0"
              role="button"
            >
              {fmtBound(loopStart)}
            </Text>
            {", "}
            <Text
              variant={TextVariant.Xs}
              color={atEnd ? BrandColor.Primary : TextColor.Secondary}
              className={styles.loopBound}
              onClick={onLoopEndReset}
              title="Reset loop end to duration"
              role="button"
            >
              {fmtBound(loopEnd)}
            </Text>
            {")"}
          </Text>
        </>
      )}
    </div>
  );
};

export default TimelineControls;
