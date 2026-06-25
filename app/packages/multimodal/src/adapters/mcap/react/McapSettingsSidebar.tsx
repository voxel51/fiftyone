import { SidebarPanel, useTiling } from "@fiftyone/tiling";
import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useMemo } from "react";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { useMcapModalSettings } from "./mcap-modal-settings";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import styles from "./McapSettingsSidebar.module.css";

/**
 * MCAP-specific left sidebar. When a pane is active, the pane body portals
 * its settings into this shell; when no pane is active, the sidebar exposes
 * scene-wide label settings.
 */
const McapSettingsSidebar: React.FC = () => {
  const { focusedTileId, setSettingsSlotEl, tiles } = useTiling();
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const slotRef = useCallback(
    (el: HTMLDivElement | null) => setSettingsSlotEl(el),
    [setSettingsSlotEl],
  );

  const contextTitle = focusedTile ? focusedTile.title : "Scene context";

  return (
    <SidebarPanel
      title={<span className={styles.contextTitle}>{contextTitle}</span>}
    >
      <div ref={slotRef} />
      {!focusedTile ? <GlobalSceneSettings /> : null}
    </SidebarPanel>
  );
};

function GlobalSceneSettings() {
  const sources = useSceneInventory();
  const {
    interpolate2dAnnotations,
    interpolate3dAnnotations,
    setInterpolate2dAnnotations,
    setInterpolate3dAnnotations,
  } = useMcapModalSettings();
  const counts = useMemo(() => sceneCounts(sources), [sources]);

  return (
    <div className={styles.root}>
      <div className={styles.summaryGrid}>
        <SummaryMetric label="Images" value={counts.images} />
        <SummaryMetric label="3D" value={counts.pointClouds} />
        <SummaryMetric label="Labels" value={counts.labels} />
      </div>

      <section className={styles.section}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Labels
        </Text>
        <div className={styles.controlStack}>
          <Checkbox
            label="Interpolate between 2D annotations"
            checked={interpolate2dAnnotations}
            onChange={setInterpolate2dAnnotations}
            {...checkboxNoSpaceToggleProps}
          />
          <Checkbox
            label="Interpolate between 3D annotations"
            checked={interpolate3dAnnotations}
            onChange={setInterpolate3dAnnotations}
            {...checkboxNoSpaceToggleProps}
          />
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricValue}>{value.toLocaleString()}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

function sceneCounts(sources: readonly SceneSource[]) {
  return {
    images: sources.filter((s) => s.type === MCAP_SOURCE_TYPE.IMAGE).length,
    labels: sources.filter((s) => s.type === MCAP_SOURCE_TYPE.IMAGE_ANNOTATION)
      .length,
    pointClouds: sources.filter((s) => s.type === MCAP_SOURCE_TYPE.POINT_CLOUD)
      .length,
  };
}

export default McapSettingsSidebar;
