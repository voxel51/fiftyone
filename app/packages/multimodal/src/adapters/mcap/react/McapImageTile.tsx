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
import { useMcapModalSettings } from "./mcap-modal-settings";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
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
  const images = useSceneSourcesByType(MCAP_SOURCE_TYPE.IMAGE);
  const annotationSources = useSceneSourcesByType(
    MCAP_SOURCE_TYPE.IMAGE_ANNOTATION
  );
  const { imageLabelTopics, interpolate2dAnnotations, setImageLabelTopics } =
    useMcapModalSettings();
  const setTileTitle = useSetTileTitle();
  // Open on the resolver-assigned source; tiles added by hand bind the
  // densest stream instead of whatever happens to be first in the file.
  const [topic, setTopic] = useState<string>(
    () => initialSourceId ?? rankImageSources(images)[0]?.id ?? ""
  );

  // This effect binds the pane to the best image source once sources resolve.
  useEffect(() => {
    if (topic && images.some((source) => source.id === topic)) return;

    const nextTopic = rankImageSources(images)[0]?.id ?? "";
    if (nextTopic !== topic) setTopic(nextTopic);
  }, [images, topic]);

  // This effect syncs the tile title with the selected image source.
  useEffect(() => {
    const label = images.find((s) => s.id === topic)?.label;
    if (label) setTileTitle(label);
  }, [topic, images, setTileTitle]);

  // This effect resets image dimensions when the selected source changes.
  useEffect(() => {
    setImageDims(null);
  }, [topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);
  const annotationTopics = useMemo(
    () => annotationSources.map((s) => s.id),
    [annotationSources]
  );
  const inferredAnnotationTopic = useMemo(
    () => (topic ? chooseAnnotationTopic(topic, annotationTopics) : null),
    [topic, annotationTopics]
  );
  const selectedLabelTopics = useMemo(() => {
    if (!topic) return [];
    if (Object.hasOwn(imageLabelTopics, topic)) {
      const available = new Set(annotationTopics);
      return imageLabelTopics[topic].filter((labelTopic) =>
        available.has(labelTopic)
      );
    }
    return inferredAnnotationTopic ? [inferredAnnotationTopic] : [];
  }, [annotationTopics, imageLabelTopics, inferredAnnotationTopic, topic]);
  const activeTopics = useMemo(
    () => (topic ? [topic, ...selectedLabelTopics] : []),
    [selectedLabelTopics, topic]
  );
  const currentLabel =
    images.find((s) => s.id === topic)?.label ?? "Select source";
  const toggleLabelTopic = (labelTopic: string, checked: boolean) => {
    if (!topic) return;
    const next = new Set(selectedLabelTopics);
    if (checked) {
      next.add(labelTopic);
    } else {
      next.delete(labelTopic);
    }
    setImageLabelTopics(
      topic,
      annotationTopics.filter((availableTopic) => next.has(availableTopic))
    );
  };

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
            <div className={settingsStyles.metaText}>
              {sourceDetails(images.find((s) => s.id === topic))}
            </div>
          </div>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Labels
            </Text>
            {annotationSources.length > 0 ? (
              <div className={settingsStyles.optionStack}>
                {annotationSources.map((s) => (
                  <Checkbox
                    key={s.id}
                    label={labelWithCount(s.label, s.recordCount)}
                    checked={selectedLabelTopics.includes(s.id)}
                    onChange={(checked) => toggleLabelTopic(s.id, checked)}
                    {...checkboxNoSpaceToggleProps}
                  />
                ))}
              </div>
            ) : (
              <span className={settingsStyles.emptyText}>
                No label topics available
              </span>
            )}
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
          {imageDims && selectedLabelTopics.length > 0 ? (
            <McapImageAnnotationOverlay
              imageWidth={imageDims.width}
              imageHeight={imageDims.height}
              interpolate={interpolate2dAnnotations}
              topics={selectedLabelTopics}
            />
          ) : null}
          <McapTileStatusBadge topics={activeTopics} />
        </div>
      ) : (
        <McapTileEmptyState topics={topic ? [topic] : []} />
      )}
    </>
  );
};

function labelWithCount(label: string, count: number | undefined): string {
  return count ? `${label} (${count.toLocaleString()})` : label;
}

function sourceDetails(source: { recordCount?: number } | undefined): string {
  return source?.recordCount
    ? `${source.recordCount.toLocaleString()} messages`
    : "Message count unavailable";
}

export default McapImageTile;
