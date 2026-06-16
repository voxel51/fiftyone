import { TileSettingsContent, useSetTileTitle } from "@fiftyone/tiling";
import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  PointCloudPanel,
  type PointCloudPanelLayer,
} from "../../../visualization/panels/point-cloud";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
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
  // Start with every source enabled. This tile only mounts after the scene
  // inventory is ready (the renderer gates on it), so `pointClouds` is already
  // populated and the lazy initializer captures the full set once.
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(
    () => new Set(pointClouds.map((s) => s.id))
  );
  const knownPointCloudIdsRef = useRef<ReadonlySet<string>>(
    new Set(pointClouds.map((s) => s.id))
  );

  useEffect(() => {
    const currentIds = new Set(pointClouds.map((s) => s.id));
    const previousIds = knownPointCloudIdsRef.current;
    setEnabled((current) => {
      const next = new Set(current);
      let changed = false;

      for (const id of currentIds) {
        if (!previousIds.has(id) && !next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      for (const id of next) {
        if (!currentIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
    knownPointCloudIdsRef.current = currentIds;
  }, [pointClouds]);

  // Selection in inventory order, so layers and statuses stay deterministic
  // regardless of the order sources were toggled in.
  const selectedTopics = useMemo(
    () => pointClouds.filter((s) => enabled.has(s.id)).map((s) => s.id),
    [pointClouds, enabled]
  );
  const frames = useMcapTopicStreams<PointCloudVisualization>(selectedTopics);

  // This effect syncs the tile title with the current 3D source selection.
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
            {pointClouds.length > 0 ? (
              <>
                <div className={settingsStyles.metaText}>
                  {selectedTopics.length.toLocaleString()} of{" "}
                  {pointClouds.length.toLocaleString()} selected
                </div>
                <div className={settingsStyles.optionStack}>
                  {pointClouds.map((s) => (
                    <Checkbox
                      key={s.id}
                      label={labelWithCount(s.label, s.recordCount)}
                      checked={enabled.has(s.id)}
                      onChange={(checked) => toggleSource(s.id, checked)}
                      {...checkboxNoSpaceToggleProps}
                    />
                  ))}
                </div>
              </>
            ) : (
              <span className={settingsStyles.emptyText}>
                No 3D sources available
              </span>
            )}
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

function labelWithCount(label: string, count: number | undefined): string {
  return count ? `${label} (${count.toLocaleString()})` : label;
}

export default Mcap3dTile;
