import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
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
import { useRecoilValue } from "recoil";

// Button's string `leadingIcon` is wrapped in a component type created on
// every render, so React remounts the SVG each render and a click that starts
// on the icon can die before pointerup. Stable component types reconcile in
// place. Mirrors `playback/src/views/stableIcons.tsx`, for the same reason.
const FitIcon: React.FC = () => <Icon name={IconName.Fullscreen} />;
const JsonIcon: React.FC = () => <Icon name={IconName.JSON} />;
const HelpIcon: React.FC = () => <Icon name={IconName.Info} />;

/**
 * What this surface actually binds. Deliberately not the looker's
 * `VIDEO_SHORTCUTS`: none of those are registered here, and listing them
 * would advertise keys that do nothing. Grows as bindings are ported.
 *
 * The keyboard entries mirror two registration sites, so they have to be kept
 * in step by hand: `TimelineControls` registers space / `.` / `,` into the
 * modal context, and `useVideoExploreKeybindings` registers the zoom pair.
 * Both are covered by tests that assert the bindings match the characters a
 * layout actually produces — this list is the only place a user can discover
 * them.
 */
const HELP_ITEMS = [
  {
    shortcut: "Space",
    title: "Play / Pause",
    detail: "Toggle playback",
  },
  {
    shortcut: ".",
    title: "Step forward",
    detail: "Advance one frame",
  },
  {
    shortcut: ",",
    title: "Step back",
    detail: "Go back one frame",
  },
  {
    // Both characters are bound, shifted or not, so the layout that puts
    // "+" on its own key works the same as the one that shifts "=".
    shortcut: "+ / =",
    title: "Zoom in",
    detail: "Zoom into the video and its labels",
  },
  {
    shortcut: "- / _",
    title: "Zoom out",
    detail: "Zoom out of the video and its labels",
  },
  {
    shortcut: "Scroll",
    title: "Zoom",
    detail: "Zoom the video and its labels together",
  },
  {
    shortcut: "Click label",
    title: "Select label",
    detail: "Toggle a label in or out of the selection, for tagging",
  },
  {
    shortcut: "Click background",
    title: "Clear selection",
    detail: "Deselect every selected label",
  },
  {
    shortcut: "Escape",
    title: "Clear selection",
    detail: "Deselect every selected label; closes the modal when none is",
  },
  {
    shortcut: "Right-click ruler",
    title: "Loop range",
    detail: "Loop the portion of the timeline on screen",
  },
  {
    shortcut: "Click readout",
    title: "Time / frame",
    detail: "Switch the readout between timecode and frame number",
  },
];

/**
 * One trailing action: an icon button with a tooltip anchored to a wrapping
 * span rather than the button, so it still shows when the button is disabled.
 */
const Action: React.FC<{
  label: string;
  icon: React.FC;
  testId: string;
  onClick: () => void;
}> = ({ label, icon, testId, onClick }) => (
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
        onClick={onClick}
      />
    </span>
  </Tooltip>
);

/**
 * The right-side action cluster the video looker carried in its controls row,
 * rebuilt against Lighter and the modal panels.
 *
 * Handed to `FrameLabelsTracks` as `trailingActions`, so it sits in the
 * timeline controls row's trailing group beside the drawer chevron — the
 * same edge the looker's cluster occupied.
 *
 * Zoom in/out are deliberately absent: scroll over the media already zooms,
 * so the buttons only duplicated a gesture users already have. Fit remains
 * because there is no gesture for it.
 */
export const VideoExploreToolbar: React.FC = () => {
  const { scene } = useLighter();
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();
  const sample = useRecoilValue(fos.modalSample);

  // `fitToContent` frames the overlays' bounding box — the looker's
  // crop-to-content. It is a documented no-op when nothing qualifies, which
  // reads to the user as a dead button, so fall back to the resting identity
  // viewport when there are no content bounds to frame.
  const handleFit = useCallback(() => {
    if (!scene) return;
    if (scene.getContentBounds()) {
      scene.fitToContent();
      return;
    }
    scene.resetZoomPan();
  }, [scene]);

  const handleJSON = useCallback(
    () => jsonPanel.toggle(sample?.sample),
    [jsonPanel, sample],
  );

  const handleHelp = useCallback(() => helpPanel.open(HELP_ITEMS), [helpPanel]);

  return (
    <>
      <Action
        label="Fit to content"
        icon={FitIcon}
        testId="video-explore-fit"
        onClick={handleFit}
      />
      <Action
        label="Sample JSON"
        icon={JsonIcon}
        testId="video-explore-json"
        onClick={handleJSON}
      />
      <Action
        label="Shortcuts & help"
        icon={HelpIcon}
        testId="video-explore-help"
        onClick={handleHelp}
      />
    </>
  );
};
