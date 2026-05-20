import {
  Checkbox,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React from "react";
import {
  useSetTileSource,
  useSetTileTitle,
  useTileSourcesByType,
  useTileSource,
} from "@fiftyone/tiling";
import styles from "../tile-settings.module.css";

/**
 * Source picker + per-tile toggles. The picker enumerates every
 * registered camera stream so the user can rebind the focused tile to
 * any of them without spawning a new tile.
 */
const CameraSettings: React.FC = () => {
  const sources = useTileSourcesByType("camera");
  const sourceId = useTileSource();
  const setSource = useSetTileSource();
  const setTitle = useSetTileTitle();

  const currentLabel =
    sources.find((s) => s.streamId === sourceId)?.title ?? "Select source";

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Source
        </Text>
        <Dropdown
          anchor={DropdownAnchor.BottomStart}
          trigger={<DropdownTrigger>{currentLabel}</DropdownTrigger>}
        >
          {sources.map((s) => (
            <MenuTextItem
              key={s.streamId}
              onClick={() => {
                setSource(s.streamId);
                setTitle(s.title);
              }}
            >
              {s.title}
            </MenuTextItem>
          ))}
        </Dropdown>
      </div>

      <Checkbox label="Show overlays" defaultChecked />
      <Checkbox label="Show bounding boxes" />
      <Checkbox label="Show track ids" />
    </div>
  );
};

export default CameraSettings;
