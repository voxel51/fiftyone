import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox, RadioGroup, Size } from "@voxel51/voodo";
import React, { useMemo } from "react";
import { useSceneInventory } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  MCAP_MAP_BASE_LAYER,
  type McapMapBaseLayer,
  useMcapMapTileSettings,
  useSetMcapMapTileSettings,
  useToggleMcapMapTileTopic,
} from "./mcap-map-tile-state";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import plotStyles from "./McapPlotTile.module.css";
import settingsStyles from "./McapTile.settings.module.css";

const BASE_LAYER_OPTIONS = [
  {
    value: MCAP_MAP_BASE_LAYER.DEFAULT,
    label: "Default basemap (OpenFreeMap)",
  },
  { value: MCAP_MAP_BASE_LAYER.NONE, label: "No basemap" },
];

const McapMapTileSettings: React.FC = () => {
  const sources = useSceneInventory();
  const locationSources = useMemo(
    () => sources.filter((source) => source.type === MCAP_SOURCE_TYPE.LOCATION),
    [sources],
  );
  const topics = useMemo(
    () => locationSources.map((source) => source.id),
    [locationSources],
  );
  const settings = useMcapMapTileSettings();
  const setSettings = useSetMcapMapTileSettings();
  const toggleTopic = useToggleMcapMapTileTopic();
  const enabledTopics = new Set(settings.enabledTopics ?? topics);
  const baseLayer = settings.baseLayer ?? MCAP_MAP_BASE_LAYER.DEFAULT;

  return (
    <TileSettingsContent>
      <div className={settingsStyles.root}>
        <div className={settingsStyles.optionStack}>
          <RadioGroup
            name="mcap-map-base-layer"
            onChange={(value) =>
              setSettings({ baseLayer: value as McapMapBaseLayer })
            }
            options={BASE_LAYER_OPTIONS}
            size={Size.Md}
            value={baseLayer}
          />
          <div className={plotStyles.fieldRow}>
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
            No GPS topics in this recording
          </span>
        ) : (
          <div className={settingsStyles.optionStack}>
            {locationSources.map((source) => (
              <div className={plotStyles.fieldRow} key={source.id}>
                <Checkbox
                  checked={enabledTopics.has(source.id)}
                  label={source.label}
                  onChange={(checked) =>
                    toggleTopic(source.id, checked, topics)
                  }
                  {...checkboxNoSpaceToggleProps}
                />
                <span className={settingsStyles.metaText}>{source.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </TileSettingsContent>
  );
};

export default McapMapTileSettings;
