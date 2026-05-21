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
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const cameras = useSceneSourcesByType("camera");
  const setTileTitle = useSetTileTitle();

  // Auto-bind to the first available camera the first time we render
  // with one available and nothing chosen yet.
  useEffect(() => {
    if (topic !== null || cameras.length === 0) return;
    const first = cameras[0];
    if (!first) return;
    setTopic(first.id);
    setTileTitle(first.label);
  }, [cameras, topic, setTileTitle]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic ?? "");
  const currentLabel =
    cameras.find((c) => c.id === topic)?.label ?? "Select source";

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
              {cameras.map((c) => (
                <MenuTextItem
                  key={c.id}
                  onClick={() => {
                    setTopic(c.id);
                    setTileTitle(c.label);
                  }}
                >
                  {c.label}
                </MenuTextItem>
              ))}
            </Dropdown>
          </div>
          <Checkbox label="Show overlays" defaultChecked />
          <Checkbox label="Show bounding boxes" />
          <Checkbox label="Show track ids" />
        </div>
      </TileSettingsContent>
      {frame ? (
        <ImagePanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapCameraTile;
