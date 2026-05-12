import { usePlayback } from "../../lib/playback/PlaybackProvider";
import {
  viewEndAtom,
  viewStartAtom,
} from "../../lib/playback/atoms";
import {
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
import React from "react";
import styles from "./TimelineTrack.module.css";

export interface TimelineTrackProps {
  id: string;
  color: string;
  bg?: string;
  start: number;
  end: number;
  events?: number[];
  height?: number;
  labelWidth?: number;
  pinned?: boolean;
  onPinClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
  id,
  color,
  bg,
  start,
  end,
  events = [],
  height = 28,
  labelWidth = 0,
  pinned = false,
  onPinClick,
  onContextMenu,
  className,
}) => {
  const viewStart = useAtomValue(viewStartAtom);
  const viewEnd = useAtomValue(viewEndAtom);
  const { seek } = usePlayback();

  const viewDuration = viewEnd - viewStart;
  const pct = (t: number) =>
    `${((t - viewStart) / viewDuration) * 100}%`;

  const clippedStart = Math.max(start, viewStart);
  const clippedEnd = Math.min(end, viewEnd);
  const barVisible = clippedStart < clippedEnd;

  return (
    <div
      className={clsx(styles.root, className)}
      style={{ height }}
      onContextMenu={onContextMenu}
    >
      {labelWidth > 0 && (
        <div className={styles.label} style={{ width: labelWidth }}>
          <div className={styles.dot} style={{ background: color }} />
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Primary}
            className={styles.labelText}
          >
            {id}
          </Text>
          {onPinClick && (
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              leadingIcon={IconName.Pin}
              aria-label={pinned ? "Unpin track" : "Pin track"}
              className={clsx(styles.pinButton, {
                [styles.pinButtonActive]: pinned,
              })}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick();
              }}
            />
          )}
        </div>
      )}

      <div
        className={styles.lane}
        onClick={(e) => {
          if (
            (e.target as HTMLElement).classList.contains(styles.event)
          )
            return;
          const rect = e.currentTarget.getBoundingClientRect();
          seek(
            viewStart +
              ((e.clientX - rect.left) / rect.width) * (viewEnd - viewStart)
          );
        }}
      >
        {barVisible && (
          <div
            className={styles.bar}
            style={{
              left: pct(clippedStart),
              width: `${((clippedEnd - clippedStart) / viewDuration) * 100}%`,
              background: bg ?? `${color}55`,
              border: `1px solid ${color}88`,
            }}
          />
        )}
        {events
          .filter((t) => t >= viewStart && t <= viewEnd)
          .map((t, i) => (
            <div
              key={i}
              className={styles.event}
              style={{ left: pct(t), background: color }}
              title={`${id} @ ${t.toFixed(3)}s`}
            />
          ))}
      </div>
    </div>
  );
};

export default TimelineTrack;
