import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  PointCloudPanel,
  type PointCloudPanelLayer,
} from "../../../visualization/panels/point-cloud";
import settingsStyles from "./McapTile.settings.module.css";
import styles from "./McapTile.module.css";
import { McapTileEmptyState, McapTileStatusBadge } from "./McapTileStreamState";
import { useMcapTopicStreams } from "./use-mcap-topic-stream";

const TILE_TYPE_LABEL = "3D";

/**
 * 3D tile: renders every enabled 3D-renderable source (point clouds, for
 * now) fused into one shared scene. Unlike the image tile, sources are
 * multi-selectable — overlaying several sensors in one view is the point
 * of a 3D panel — so the settings sidebar offers checkboxes, not a
 * single-choice dropdown. All sources start enabled.
 */
const Mcap3dTile: React.FC = () => {
  const pointClouds = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const setTileTitle = useSetTileTitle();
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(
    () => new Set(pointClouds.map((s) => s.id))
  );

  // Selection in inventory order, so layers and statuses stay deterministic
  // regardless of the order sources were toggled in.
  const selectedTopics = useMemo(
    () => pointClouds.filter((s) => enabled.has(s.id)).map((s) => s.id),
    [pointClouds, enabled]
  );
  const frames = useMcapTopicStreams<PointCloudVisualization>(selectedTopics);

  // Keep the tile title in sync: a single selection reads as that source,
  // anything else as the generic tile kind.
  useEffect(() => {
    const label =
      selectedTopics.length === 1
        ? pointClouds.find((s) => s.id === selectedTopics[0])?.label
        : null;
    setTileTitle(label ?? TILE_TYPE_LABEL);
  }, [selectedTopics, pointClouds, setTileTitle]);

  const layers = useMemo(() => {
    const result: PointCloudPanelLayer[] = [];
    selectedTopics.forEach((topic, index) => {
      const frame = frames[index];
      if (frame) {
        result.push({ frame, id: topic });
      }
    });
    return result;
  }, [selectedTopics, frames]);

  const toggleSource = (id: string, checked: boolean) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              Sources
            </Text>
            {pointClouds.map((s) => (
              <Checkbox
                key={s.id}
                label={s.label}
                checked={enabled.has(s.id)}
                onChange={(checked) => toggleSource(s.id, checked)}
              />
            ))}
          </div>
        </div>
      </TileSettingsContent>
      {selectedTopics.length === 0 ? (
        <div className={styles.loading}>
          <span className={styles.emptyText}>No sources selected</span>
        </div>
      ) : layers.length > 0 ? (
        <div className={styles.panelStack}>
          <PointCloudPanel layers={layers} className={styles.panel} />
          <McapTileStatusBadge topics={selectedTopics} />
        </div>
      ) : (
        <McapTileEmptyState topics={selectedTopics} />
      )}
    </>
  );
};

export default Mcap3dTile;
