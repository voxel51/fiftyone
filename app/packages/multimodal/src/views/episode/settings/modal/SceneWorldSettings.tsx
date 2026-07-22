import { RadioGroup, Size, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useOptionalScene3dViewSettings } from "../../spatial/view-settings-context";
import {
  SCENE_3D_UP_AXES,
  type Scene3dUpAxis,
} from "../../spatial/view-preferences";
import { useSceneFrameControls } from "../../spatial/frame-transforms/scene-frame-controls";
import { FrameSelect } from "../controls/FrameSelect";
import SidebarGroup from "../controls/SidebarGroup";
import { SettingsLabel } from "../controls/SettingsLabel";
import settingsStyles from "../../tiles/Tile.settings.module.css";

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
const SceneWorldSettings: React.FC = () => {
  const viewSettings = useOptionalScene3dViewSettings();
  const frameControls = useSceneFrameControls();

  if (!viewSettings) {
    return null;
  }

  const { sceneUpAxis, setSceneUpAxis } = viewSettings;
  const summary = frameControls?.worldFrameId
    ? `${frameControls.worldFrameId} · up ${sceneUpAxis.toUpperCase()}`
    : `up ${sceneUpAxis.toUpperCase()}`;

  return (
    <SidebarGroup defaultExpanded={false} summary={summary} title="World">
      {frameControls ? (
        <>
          <FrameSelect
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
    </SidebarGroup>
  );
};

const UP_AXIS_OPTIONS = SCENE_3D_UP_AXES.map((axis) => ({
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
  readonly onChange: (value: Scene3dUpAxis) => void;
  readonly tooltip: string;
  readonly value: Scene3dUpAxis;
}) {
  return (
    <div className={settingsStyles.field}>
      <SettingsLabel label="Up Axis" tooltip={tooltip} />
      <RadioGroup
        name="episode-scene-up-axis"
        onChange={(next) => onChange(next as Scene3dUpAxis)}
        options={UP_AXIS_OPTIONS}
        size={Size.Sm}
        value={value}
      />
    </div>
  );
}

export default SceneWorldSettings;
