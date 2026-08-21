import { Button, SingleValueSlider, Size, Variant } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useCallback, useEffect, useState } from "react";
import { useAudio } from "../../lib/playback/use-audio";
import { VolumeOffIcon, VolumeUpIcon } from "../stableIcons";
import { channelState } from "./channel-contract";
import { useMasterChannel } from "./use-master-channel";
import styles from "./TimelineControls.module.css";

const ERROR_TITLE = "Audio failed to load";

/**
 * Master volume: a mute toggle that grows a horizontal fader to its right on
 * hover, the way a video player's volume control usually behaves.
 *
 * The button itself mutes and unmutes — there is no popover any more. The
 * fader is always mounted and animates its width from zero, both so it has
 * something to transition from (a conditionally rendered element does not)
 * and so the slider keeps its identity mid-drag.
 *
 * Open purely on `:hover`, plus an explicit `dragging` flag. It deliberately
 * does NOT use `:focus-within`: voodo's slider is built from plain divs with
 * no `role` or `tabIndex`, so the only focusable thing in here is the mute
 * button — and a button keeps focus after a click, which pinned the fader
 * open until you clicked somewhere else.
 *
 * `dragging` is what keeps it open once a drag starts. Without it, dragging
 * the knob past the edge of the control drops `:hover`, the wrapper collapses
 * to zero width, and the drag dies at 0 — which reads as "the fader re-mutes
 * itself and will not come back up".
 *
 * Renders nothing unless an audio integration has published
 * `audioAvailableAtom`.
 */
const VolumeControl: React.FC = () => {
  const { availability, masterMuted } = useAudio();
  const master = useMasterChannel();
  const [dragging, setDragging] = useState(false);

  // Released anywhere, not just over the knob — a drag that ends off-control
  // must still clear the flag or the fader stays stuck open.
  useEffect(() => {
    if (!dragging) return undefined;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);

  // The controls row treats a bare click as "toggle the tracks drawer" and
  // only exempts real interactive elements — `button, [role=button], a,
  // input, select, textarea`. voodo's slider is divs with no role, so every
  // press on the fader was also opening and closing the timeline.
  const stopRowToggle = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  if (availability === "unavailable") {
    return null;
  }

  const errored = availability === "error";
  const isOff = errored || masterMuted;
  const { shown, muteLabel, faderLabel, handleChange } = channelState({
    ...master,
    label: "Volume",
    // Visible wording aside this is still the master channel — keep the
    // spoken name the one that identifies it.
    a11yLabel: "Master",
    errored,
    testIdPrefix: "timeline-controls",
  });

  return (
    <span
      className={clsx(styles.volumeControl, {
        [styles.volumeControlDragging]: dragging,
      })}
      data-testid="timeline-controls-volume-control"
      title={errored ? ERROR_TITLE : undefined}
      onClick={stopRowToggle}
      onPointerDown={stopRowToggle}
    >
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        className={clsx(styles.iconButton, {
          [styles.muteButtonOn]: !isOff,
          [styles.muteButtonOff]: isOff,
        })}
        data-testid="timeline-controls-mute"
        disabled={errored}
        leadingIcon={isOff ? VolumeOffIcon : VolumeUpIcon}
        aria-label={errored ? ERROR_TITLE : muteLabel}
        aria-pressed={masterMuted}
        onClick={masterMuted ? master.onUnmute : master.onMute}
      />
      {/* Collapsed to zero width rather than unmounted — see above. The
          wrapper owns the animation so the slider itself never has to
          re-measure a width mid-transition. */}
      <span
        className={clsx(styles.volumeSlider, {
          [styles.volumeSliderDisabled]: errored,
        })}
        onPointerDown={() => setDragging(true)}
      >
        <SingleValueSlider
          bare
          className={styles.volumeSliderInput}
          data-testid="timeline-controls-volume"
          aria-label={faderLabel}
          aria-disabled={errored}
          min={0}
          max={1}
          step={0.01}
          debounceDelay={0}
          value={shown}
          onChange={handleChange}
        />
      </span>
    </span>
  );
};

export default VolumeControl;
