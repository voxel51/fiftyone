import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import {
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapLidarTile: React.FC = () => {
  const lidars = useSceneSourcesByType(MCAP_SOURCE_TYPE.LIDAR);
  const setTileTitle = useSetTileTitle();
  // Initialize from the first available source — develop's auto-pick
  // behaviour. State lets the user swap via the dropdown.
  const [topic, setTopic] = useState<string>(lidars[0]?.id ?? "");

  // If lidars populated after the initial render (or the selected topic
  // disappeared), bind to the first available source.
  useEffect(() => {
    if (!topic && lidars[0]) {
      setTopic(lidars[0].id);
    }
  }, [lidars, topic]);

  // Keep the tile title in sync whenever the selected topic resolves.
  useEffect(() => {
    const label = lidars.find((l) => l.id === topic)?.label;
    if (label) setTileTitle(label);
  }, [topic, lidars, setTileTitle]);

  const frame = useMcapTopicStream<PointCloudVisualization>(topic);
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
        </div>
      </TileSettingsContent>
      {frame ? (
        <div className={styles.panelStack}>
          <PointCloudPanel frame={frame} className={styles.panel} />
          <McapTileStatusBadge topic={topic} />
        </div>
      ) : (
        <McapTileEmptyState topic={topic} />
      )}
    </>
  );
};

export default McapLidarTile;
