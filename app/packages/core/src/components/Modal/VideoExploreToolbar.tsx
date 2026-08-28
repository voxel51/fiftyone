import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { Button, Icon, IconName, Size, Variant } from "@voxel51/voodo";
import React, { useCallback } from "react";
import { useRecoilState, useRecoilValue } from "recoil";

// Button's string `leadingIcon` is wrapped in a component type created on
// every render, so React remounts the SVG each render and a click that starts
// on the icon can die before pointerup. Stable component types reconcile in
// place. Mirrors `playback/src/views/stableIcons.tsx`, for the same reason.
const ZoomOutIcon: React.FC = () => <Icon name={IconName.Remove} />;
const ZoomInIcon: React.FC = () => <Icon name={IconName.Add} />;
const FitIcon: React.FC = () => <Icon name={IconName.Fullscreen} />;
const LabelsIcon: React.FC = () => <Icon name={IconName.Detection} />;
const JsonIcon: React.FC = () => <Icon name={IconName.JSON} />;
const HelpIcon: React.FC = () => <Icon name={IconName.Info} />;

/**
 * What this surface actually binds. Deliberately not the looker's
 * `VIDEO_SHORTCUTS`: none of those are registered here, and listing them
 * would advertise keys that do nothing. Grows as bindings are ported.
 */
const HELP_ITEMS = [
  {
    shortcut: "Scroll",
    title: "Zoom",
    detail: "Zoom the video and its labels together",
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
 * The right-side action cluster the video looker carried in its controls row,
 * rebuilt against Lighter and the modal panels.
 *
 * Handed to `FrameLabelsTracks` as `trailingActions`, so it sits in the
 * timeline controls row's trailing group beside the drawer chevron — the
 * same edge the looker's cluster occupied.
 *
 * Maps onto the looker elements it replaces: `PlusElement` / `MinusElement`
 * (zoom), `CropToContentButtonElement` (fit), `ToggleOverlaysButtonElement`,
 * `JSONButtonElement` and `HelpButtonElement`. `OptionsButtonElement` and
 * `SupportLockButtonElement` are not yet ported.
 */
export const VideoExploreToolbar: React.FC = () => {
  const { scene, zoomIn, zoomOut } = useLighter();
  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();
  const sample = useRecoilValue(fos.modalSample);
  const [showOverlays, setShowOverlays] = useRecoilState(fos.showOverlays);

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

  const handleToggleOverlays = useCallback(
    () => setShowOverlays((current) => !current),
    [setShowOverlays],
  );

  const handleJSON = useCallback(
    () => jsonPanel.toggle(sample?.sample),
    [jsonPanel, sample],
  );

  const handleHelp = useCallback(() => helpPanel.open(HELP_ITEMS), [helpPanel]);

  return (
    <>
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-zoom-out"
        leadingIcon={ZoomOutIcon}
        aria-label="Zoom out"
        onClick={zoomOut}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-zoom-in"
        leadingIcon={ZoomInIcon}
        aria-label="Zoom in"
        onClick={zoomIn}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-fit"
        leadingIcon={FitIcon}
        aria-label="Fit to content"
        onClick={handleFit}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-toggle-overlays"
        leadingIcon={LabelsIcon}
        aria-label={showOverlays ? "Hide labels" : "Show labels"}
        aria-pressed={showOverlays}
        onClick={handleToggleOverlays}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-json"
        leadingIcon={JsonIcon}
        aria-label="Sample JSON"
        onClick={handleJSON}
      />
      <Button
        variant={Variant.Icon}
        size={Size.Xs}
        data-testid="video-explore-help"
        leadingIcon={HelpIcon}
        aria-label="Shortcuts & help"
        onClick={handleHelp}
      />
    </>
  );
};
