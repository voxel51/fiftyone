import { Checkbox, RadioGroup, Size } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useSceneInventory } from "../../../../scene-inventory/react";
import { SCENE_SOURCE_TYPE } from "../../../../ir";
import {
  MAP_BASE_LAYER,
  type MapBaseLayer,
  useMapTileSettings,
  useSetMapTileSettings,
  useToggleMapTileStream,
} from "./tile-state";
import { checkboxNoSpaceToggleProps } from "../../settings/controls/settings-keyboard";
import settingsStyles from "../../tiles/Tile.settings.module.css";

const BASE_LAYER_OPTIONS = [
  {
    value: MAP_BASE_LAYER.DEFAULT,
    label: "Default basemap (OpenFreeMap)",
  },
  { value: MAP_BASE_LAYER.NONE, label: "No basemap" },
];

const MapTileSettings: React.FC = () => {
  const sources = useSceneInventory();
  const locationSources = useMemo(
    () =>
      sources.filter((source) => source.type === SCENE_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const streams = useMemo(
    () => locationSources.map((source) => source.id),
    [locationSources],
  );
  const settings = useMapTileSettings();
  const setSettings = useSetMapTileSettings();
  const toggleStream = useToggleMapTileStream();
  const enabledStreams = new Set(settings.enabledStreams ?? streams);
  const baseLayer = settings.baseLayer ?? MAP_BASE_LAYER.DEFAULT;

  return (
    <div className={settingsStyles.root}>
      <div className={settingsStyles.optionStack}>
        <RadioGroup
          name="episode-map-base-layer"
          onChange={(value) =>
            setSettings({ baseLayer: value as MapBaseLayer })
          }
          options={BASE_LAYER_OPTIONS}
          size={Size.Md}
          value={baseLayer}
        />
        <div className={settingsStyles.fieldRow}>
          <Checkbox
            checked={settings.followEgo}
            label="Follow playhead"
            onChange={(checked) => setSettings({ followEgo: checked })}
            {...checkboxNoSpaceToggleProps}
          />
        </div>
      </div>
      {locationSources.length === 0 ? (
        <span className={settingsStyles.emptyText}>
          No GPS streams in this recording
        </span>
      ) : (
        <div className={settingsStyles.optionStack}>
          {locationSources.map((source) => (
            <div className={settingsStyles.fieldRow} key={source.id}>
              <Checkbox
                checked={enabledStreams.has(source.id)}
                label={source.label}
                onChange={(checked) =>
                  toggleStream(source.id, checked, streams)
                }
                {...checkboxNoSpaceToggleProps}
              />
              <span className={settingsStyles.metaText}>{source.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MapTileSettings;
