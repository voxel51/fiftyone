import { RadioGroup, Size, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useOptionalEpisode3dViewSettings } from "../../spatial/view-settings-context";
import {
  EPISODE_3D_SCENE_UP_AXES,
  type Episode3dSceneUpAxis,
} from "../../spatial/view-preferences";
import { useEpisodeSceneFrameControls } from "../../spatial/frame-transforms/scene-frame-controls";
import { EpisodeFrameSelect } from "../controls/EpisodeFrameSelect";
import EpisodeSidebarGroup from "../controls/EpisodeSidebarGroup";
import { EpisodeSettingsLabel } from "../controls/EpisodeSettingsLabel";
import settingsStyles from "../../tiles/EpisodeTile.settings.module.css";

const WORLD_FRAME_TOOLTIP =
  "The coordinate system used to place the active transform component. One reference frame applies to every 3D view of the scene.";
const UP_AXIS_TOOLTIP =
  "World axis treated as up by the 3D camera, gizmo, and reference grid.";

/**
 * Scene-scoped coordinate-system controls: the world frame everything is
 * drawn in and the axis that counts as up. Both apply to every 3D view —
 * the world-frame selection writes through the modal-wide preference, so
 * concurrent 3D tiles converge on the same world. Renders nothing outside
 * a playback host (no scene, nothing to orient); shows a hint while no 3D
 * view is mounted to give the frame list meaning.
 */
const EpisodeSceneWorldSettings: React.FC = () => {
  const viewSettings = useOptionalEpisode3dViewSettings();
  const frameControls = useEpisodeSceneFrameControls();

  if (!viewSettings) {
    return null;
  }

  const { sceneUpAxis, setSceneUpAxis } = viewSettings;
  const summary = frameControls?.worldFrameId
    ? `${frameControls.worldFrameId} · up ${sceneUpAxis.toUpperCase()}`
    : `up ${sceneUpAxis.toUpperCase()}`;

  return (
    <EpisodeSidebarGroup
      defaultExpanded={false}
      summary={summary}
      title="World"
    >
      {frameControls ? (
        <>
          <EpisodeFrameSelect
            disabled={frameControls.frameIds.length === 0}
            label="Reference Frame"
            onChange={frameControls.updateWorldFrameId}
            options={frameControls.frameIds}
            tooltip={WORLD_FRAME_TOOLTIP}
            value={frameControls.worldFrameId}
          />
          {frameControls.worldFrameSelectionSource === "user" ? (
            <button
              className={settingsStyles.recommendButton}
              onClick={frameControls.useRecommendedWorldFrame}
              type="button"
            >
              Use recommended frame
            </button>
          ) : null}
        </>
      ) : (
        <Text color={TextColor.Muted} variant={TextVariant.Xs}>
          Add a 3D panel to choose the reference frame.
        </Text>
      )}
      <SceneUpAxisSelect
        onChange={setSceneUpAxis}
        tooltip={UP_AXIS_TOOLTIP}
        value={sceneUpAxis}
      />
    </EpisodeSidebarGroup>
  );
};

const UP_AXIS_OPTIONS = EPISODE_3D_SCENE_UP_AXES.map((axis) => ({
  label: axis.toUpperCase(),
  value: axis,
}));

// Three fixed options: a radio group keeps every choice visible (the
// settings audit's cardinality rule), like the map tile's basemap picker.
function SceneUpAxisSelect({
  onChange,
  tooltip,
  value,
}: {
  readonly onChange: (value: Episode3dSceneUpAxis) => void;
  readonly tooltip: string;
  readonly value: Episode3dSceneUpAxis;
}) {
  return (
    <div className={settingsStyles.field}>
      <EpisodeSettingsLabel label="Up Axis" tooltip={tooltip} />
      <RadioGroup
        name="episode-scene-up-axis"
        onChange={(next) => onChange(next as Episode3dSceneUpAxis)}
        options={UP_AXIS_OPTIONS}
        size={Size.Sm}
        value={value}
      />
    </div>
  );
}

export default EpisodeSceneWorldSettings;
