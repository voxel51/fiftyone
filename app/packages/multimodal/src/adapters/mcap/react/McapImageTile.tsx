import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
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
import React, { useEffect, useMemo, useState } from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { chooseAnnotationTopic } from "../topic-matching";
import { ImagePanel } from "../../../visualization/panels/image";
import McapImageAnnotationOverlay from "./McapImageAnnotationOverlay";
import { rankImageSources } from "./playback-layout";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import type { McapTileProps } from "./mcap-tile-types";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapImageTile: React.FC<McapTileProps> = ({ initialSourceId }) => {
  const [imageDims, setImageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [interpolateAnnotations, setInterpolateAnnotations] = useState(true);
  const images = useSceneSourcesByType(MCAP_SOURCE_TYPE.IMAGE);
  const annotationSources = useSceneSourcesByType(
    MCAP_SOURCE_TYPE.IMAGE_ANNOTATION
  );
  const setTileTitle = useSetTileTitle();
  // Open on the resolver-assigned source; tiles added by hand bind the
  // densest stream instead of whatever happens to be first in the file.
  const [topic, setTopic] = useState<string>(
    () => initialSourceId ?? rankImageSources(images)[0]?.id ?? ""
  );

  // If sources populated after the initial render (or the selected topic
  // disappeared), bind to the best available source.
  useEffect(() => {
    if (topic && images.some((source) => source.id === topic)) return;

    const nextTopic = rankImageSources(images)[0]?.id ?? "";
    if (nextTopic !== topic) setTopic(nextTopic);
  }, [images, topic]);

  // Keep the tile title in sync whenever the selected topic resolves.
  useEffect(() => {
    const label = images.find((s) => s.id === topic)?.label;
    if (label) setTileTitle(label);
  }, [topic, images, setTileTitle]);

  // Reset stale dims when the image source changes so the overlay cannot
  // briefly use the previous source's dimensions before onImageLoaded fires.
  useEffect(() => {
    setImageDims(null);
  }, [topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);
  // Pair the image with the annotation stream that actually exists in
  // the scene — exact `<prefix>/annotations` sibling first, fuzzy token
  // match otherwise — instead of guessing a topic by convention.
  const annotationTopic = useMemo(
    () =>
      topic
        ? chooseAnnotationTopic(
            topic,
            annotationSources.map((s) => s.id)
          )
        : null,
    [topic, annotationSources]
  );
  const currentLabel =
    images.find((s) => s.id === topic)?.label ?? "Select source";

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
              {images.map((s) => (
                <MenuTextItem
                  key={s.id}
                  onClick={() => {
                    setTopic(s.id);
                    setTileTitle(s.label);
                  }}
                >
                  {s.label}
                </MenuTextItem>
              ))}
            </Dropdown>
          </div>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Annotations
            </Text>
            <Checkbox
              label="Interpolate between annotations"
              checked={interpolateAnnotations}
              onChange={setInterpolateAnnotations}
            />
          </div>
        </div>
      </TileSettingsContent>
      {frame ? (
        <div className={styles.imageStack}>
          <ImagePanel
            frame={frame}
            className={styles.panel}
            onImageLoaded={(width, height) =>
              setImageDims((prev) =>
                prev?.width === width && prev?.height === height
                  ? prev
                  : { width, height }
              )
            }
          />
          {imageDims && annotationTopic ? (
            <McapImageAnnotationOverlay
              topic={annotationTopic}
              imageWidth={imageDims.width}
              imageHeight={imageDims.height}
              interpolate={interpolateAnnotations}
            />
          ) : null}
          <McapTileStatusBadge topics={topic ? [topic] : []} />
        </div>
      ) : (
        <McapTileEmptyState topics={topic ? [topic] : []} />
      )}
    </>
  );
};

export default McapImageTile;
