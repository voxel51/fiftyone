import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuCheckItem,
  Size,
} from "@voxel51/voodo";
import React from "react";
import { usePlayback } from "../../lib/playback/PlaybackProvider";
import { useSpeed } from "../../lib/playback/use-playback-state";
import styles from "./TimelineControls.module.css";

/**
 * Preset playback speeds surfaced as discrete choices in the UI. The engine's
 * `setSpeed` accepts any finite positive number — these presets only gate what
 * the picker offers, so a slider / free-form number input can replace this
 * menu later without touching the engine or the `speedAtom` type.
 */
export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3] as const;

/** `1` -> "1×", `0.25` -> "0.25×". */
const fmtSpeed = (n: number): string => `${n}×`;

/**
 * Playback-speed picker for the modern timeline controls. Reads the live
 * `speedAtom` via `useSpeed()` (re-renders only on speed change, not per RAF
 * tick) and writes through `usePlayback().setSpeed`. The trigger shows the
 * active speed; the menu opens upward since the controls sit near the bottom
 * of the modal.
 */
const SpeedControl: React.FC = () => {
  const speed = useSpeed();
  const { setSpeed } = usePlayback();

  return (
    <Dropdown
      anchor={DropdownAnchor.Top}
      className={styles.speed}
      trigger={
        <DropdownTrigger
          size={Size.Xs}
          data-testid="timeline-controls-speed"
          aria-label={`Playback speed: ${fmtSpeed(speed)}`}
        >
          {fmtSpeed(speed)}
        </DropdownTrigger>
      }
    >
      {SPEED_PRESETS.map((n) => (
        <MenuCheckItem
          key={n}
          checked={n === speed}
          onClick={() => setSpeed(n)}
          data-testid={`timeline-controls-speed-option-${n}`}
        >
          {fmtSpeed(n)}
        </MenuCheckItem>
      ))}
    </Dropdown>
  );
};

export default SpeedControl;
