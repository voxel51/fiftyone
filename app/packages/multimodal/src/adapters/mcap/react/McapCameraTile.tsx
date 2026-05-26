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
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const cameras = useSceneSourcesByType("camera");
  const setTileTitle = useSetTileTitle();
  // Initialize from the first available source.
  // State lets the user swap via the dropdown.
  const [topic, setTopic] = useState<string>(cameras[0]?.id ?? "");

  // Keep the tile title in sync whenever the selected topic resolves.
  useEffect(() => {
    const label = cameras.find((c) => c.id === topic)?.label;
    if (label) setTileTitle(label);
  }, [topic, cameras, setTileTitle]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);
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
