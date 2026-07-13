import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useOptionalMcap3dViewSettings } from "./mcap-3d-view-settings-context";
import {
  MCAP_3D_SCENE_UP_AXES,
  type Mcap3dSceneUpAxis,
} from "./mcap-3d-scene-up";
import { useMcapSceneFrameControls } from "./mcap-scene-frames-context";
import { McapFrameSelect } from "./McapFrameSelect";
import McapSidebarGroup from "./McapSidebarGroup";
import { McapSettingsLabel } from "./McapSettingsLabel";
import settingsStyles from "./McapTile.settings.module.css";

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
const McapSceneWorldSettings: React.FC = () => {
  const viewSettings = useOptionalMcap3dViewSettings();
  const frameControls = useMcapSceneFrameControls();

  if (!viewSettings) {
    return null;
  }

  const { sceneUpAxis, setSceneUpAxis } = viewSettings;
  const summary = frameControls?.worldFrameId
    ? `${frameControls.worldFrameId} · up ${sceneUpAxis.toUpperCase()}`
    : `up ${sceneUpAxis.toUpperCase()}`;

  return (
    <McapSidebarGroup summary={summary} title="World">
      {frameControls ? (
        <>
          <McapFrameSelect
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
    </McapSidebarGroup>
  );
};

function SceneUpAxisSelect({
  onChange,
  tooltip,
  value,
}: {
  readonly onChange: (value: Mcap3dSceneUpAxis) => void;
  readonly tooltip: string;
  readonly value: Mcap3dSceneUpAxis;
}) {
  return (
    <label className={settingsStyles.field}>
      <McapSettingsLabel label="Up Axis" tooltip={tooltip} />
      <select
        aria-label="Up Axis"
        className={settingsStyles.select}
        onChange={(event) => onChange(event.target.value as Mcap3dSceneUpAxis)}
        value={value}
      >
        {MCAP_3D_SCENE_UP_AXES.map((axis) => (
          <option key={axis} value={axis}>
            {axis.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

export default McapSceneWorldSettings;
