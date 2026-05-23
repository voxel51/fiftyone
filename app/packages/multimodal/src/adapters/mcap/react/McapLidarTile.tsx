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
import McapLidarBoxes from "./McapLidarBoxes";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";
import { useMcapTfTree } from "./use-tf-tree";

const SCENE_ANNOTATION_TOPIC = "/markers/annotations";

const McapLidarTile: React.FC = () => {
  const [showAnnotations, setShowAnnotations] = useState(false);
  const [tfReady, setTfReady] = useState(false);
  const lidars = useSceneSourcesByType("lidar");
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

  // Use the selected lidar's frame_id as the render frame. The topic
  // doubles as the TF frame name (`/LIDAR_TOP`-style names → frame
  // `LIDAR_TOP`).
  const renderFrame = topic ? topic.replace(/^\//, "") : "";

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
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Annotations
            </Text>
            <Checkbox
              label={
                showAnnotations && !tfReady
                  ? "Show 3D annotations (loading…)"
                  : "Show 3D annotations"
              }
              checked={showAnnotations}
              onChange={setShowAnnotations}
            />
          </div>
        </div>
      </TileSettingsContent>
      {showAnnotations ? (
        <TfReadyReporter onReady={setTfReady} />
      ) : null}
      {frame ? (
        <PointCloudPanel frame={frame} className={styles.panel}>
          {showAnnotations && renderFrame ? (
            <McapLidarBoxes
              topic={SCENE_ANNOTATION_TOPIC}
              renderFrame={renderFrame}
            />
          ) : null}
        </PointCloudPanel>
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

/**
 * Headless: subscribes to the TF tree only while mounted (i.e. while
 * the lidar annotations toggle is on), and reports ready state up so
 * the tile can show a loading status next to the checkbox.
 */
const TfReadyReporter: React.FC<{ onReady: (ready: boolean) => void }> = ({
  onReady,
}) => {
  const { ready } = useMcapTfTree();
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  return null;
};

export default McapLidarTile;
