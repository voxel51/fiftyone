import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import {
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
import McapCameraAnnotationOverlay from "./McapCameraAnnotationOverlay";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const cameras = useSceneSourcesByType("camera");
  const setTileTitle = useSetTileTitle();
  const [topic, setTopic] = useState<string>(cameras[0]?.id ?? "");

  // If cameras populated after the initial render (or the selected topic
  // disappeared), bind to the first available source.
  useEffect(() => {
    if (!topic && cameras[0]) {
      setTopic(cameras[0].id);
    }
  }, [cameras, topic]);

  // Keep the tile title in sync whenever the selected topic resolves.
  useEffect(() => {
    const label = cameras.find((c) => c.id === topic)?.label;
    if (label) setTileTitle(label);
  }, [topic, cameras, setTileTitle]);

  // Reset stale dims when the camera source changes so the overlay cannot
  // briefly use the previous camera's dimensions before onImageLoaded fires.
  useEffect(() => {
    setImageDims(null);
  }, [topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);
  const annotationTopic = topic ? annotationsTopicFor(topic) : null;
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
        </div>
      </TileSettingsContent>
      {frame ? (
        <div className={styles.imageStack}>
          <ImagePanel
            frame={frame}
            className={styles.panel}
            onImageLoaded={(width, height) => setImageDims({ width, height })}
          />
          {imageDims && annotationTopic ? (
            <McapCameraAnnotationOverlay
              topic={annotationTopic}
              imageWidth={imageDims.width}
              imageHeight={imageDims.height}
            />
          ) : null}
        </div>
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

// `/CAM_FRONT/image_rect_compressed` → `/CAM_FRONT/annotations`.
function annotationsTopicFor(cameraTopic: string): string | null {
  const idx = cameraTopic.indexOf("/", 1);
  if (idx <= 0) return null;
  return `${cameraTopic.slice(0, idx)}/annotations`;
}

export default McapCameraTile;
