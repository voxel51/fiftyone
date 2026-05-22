import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import {
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapLidarTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const lidars = useSceneSourcesByType("lidar");
  const setTileTitle = useSetTileTitle();

  useEffect(() => {
    if (topic !== null || lidars.length === 0) return;
    const first = lidars[0];
    if (!first) return;
    setTopic(first.id);
    setTileTitle(first.label);
  }, [lidars, topic, setTileTitle]);

  const frame = useMcapTopicStream<PointCloudVisualization>(topic ?? "");
  const currentLabel =
    lidars.find((l) => l.id === topic)?.label ?? "Select source";

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Source
            </Text>
            <Dropdown
              anchor={DropdownAnchor.BottomStart}
              trigger={<DropdownTrigger>{currentLabel}</DropdownTrigger>}
            >
              {lidars.map((l) => (
                <MenuTextItem
                  key={l.id}
                  onClick={() => {
                    setTopic(l.id);
                    setTileTitle(l.label);
                  }}
                >
                  {l.label}
                </MenuTextItem>
              ))}
            </Dropdown>
          </div>
          <Checkbox label="Color by height" defaultChecked />
          <Checkbox label="Show ground plane" />
          <Checkbox label="Show intensity overlay" />
          <Checkbox label="Cull behind sensor" defaultChecked />
        </div>
      </TileSettingsContent>
      {frame ? (
        <PointCloudPanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapLidarTile;
