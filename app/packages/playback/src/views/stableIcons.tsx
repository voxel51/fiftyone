import { Icon, IconName } from "@voxel51/voodo";
import React from "react";

// Button's string `leadingIcon` is wrapped in a component type created on
// every render, so React remounts the SVG each render — a click that starts
// on the icon dies when a re-render lands before pointerup (constant during
// playback). A stable component reconciles in place. Remove once voodo's
// IconWrapper keeps a stable type for string icons.
export const ChevronBottomIcon: React.FC = () => (
  <Icon name={IconName.ChevronBottom} />
);
export const ChevronLeftIcon: React.FC = () => (
  <Icon name={IconName.ChevronLeft} />
);
export const ChevronRightIcon: React.FC = () => (
  <Icon name={IconName.ChevronRight} />
);
export const PauseIcon: React.FC = () => <Icon name={IconName.Pause} />;
export const PinIcon: React.FC = () => <Icon name={IconName.Pin} />;
export const PlayIcon: React.FC = () => <Icon name={IconName.Play} />;
export const TagIcon: React.FC = () => <Icon name={IconName.Tag} />;
export const VolumeOffIcon: React.FC = () => <Icon name={IconName.VolumeOff} />;
export const VolumeUpIcon: React.FC = () => <Icon name={IconName.VolumeUp} />;
