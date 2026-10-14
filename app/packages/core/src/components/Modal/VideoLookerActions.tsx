/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { VideoLooker } from "@fiftyone/looker";
import {
  Anchor,
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback } from "react";

// Button's string `leadingIcon` is wrapped in a component type created on
// every render, so React remounts the SVG each render and a click that starts
// on the icon can die before pointerup. Stable component types reconcile in
// place. Mirrors `playback/src/views/stableIcons.tsx`, for the same reason.
const FitIcon: React.FC = () => <Icon name={IconName.Fullscreen} />;
const JsonIcon: React.FC = () => <Icon name={IconName.JSON} />;
const HelpIcon: React.FC = () => <Icon name={IconName.Info} />;

/**
 * One trailing action: an icon button with a tooltip anchored to a wrapping
 * span rather than the button, so it still shows while the button is
 * disabled.
 */
const Action: React.FC<{
  label: string;
  icon: React.FC;
  testId: string;
  disabled: boolean;
  onClick: () => void;
}> = ({ label, icon, testId, disabled, onClick }) => (
  <Tooltip
    portal
    anchor={Anchor.Top}
    content={<Text variant={TextVariant.Sm}>{label}</Text>}
  >
    <span>
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid={testId}
        leadingIcon={icon}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      />
    </span>
  </Tooltip>
);

/**
 * The timeline's trailing actions for the video looker surface: the controls
 * the looker's own transport bar carried that the timeline doesn't replace.
 *
 * The looker's bar is hidden under the timeline, so its buttons go with it.
 * Each one here does what that bar's button and its shortcut do: fit is
 * crop-to-content (`z`), and JSON and help (`j`, `?`) dispatch the same
 * `panels` event, so `useLooker` opens the panel and keeps the looker's
 * `showJSON` option (which Escape reads) in step.
 */
export const VideoLookerActions: React.FC<{ looker: VideoLooker | null }> = ({
  looker,
}) => {
  const handleFit = useCallback(() => looker?.cropToContent(), [looker]);

  const handleJSON = useCallback(
    () => looker?.dispatchEvent("panels", { showJSON: "toggle" }),
    [looker],
  );

  const handleHelp = useCallback(
    () =>
      looker?.dispatchEvent("panels", {
        showHelp: "toggle",
        SHORTCUTS: looker.state.SHORTCUTS,
      }),
    [looker],
  );

  return (
    <>
      <Action
        label="Fit to content"
        icon={FitIcon}
        testId="video-explore-fit"
        disabled={!looker}
        onClick={handleFit}
      />
      <Action
        label="Sample JSON"
        icon={JsonIcon}
        testId="video-explore-json"
        disabled={!looker}
        onClick={handleJSON}
      />
      <Action
        label="Shortcuts & help"
        icon={HelpIcon}
        testId="video-explore-help"
        disabled={!looker}
        onClick={handleHelp}
      />
    </>
  );
};
