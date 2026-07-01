import { SidebarPanel, useTiling } from "@fiftyone/tiling";
import { Checkbox, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useMemo } from "react";
import { useSceneInventory, type SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  type McapTemporalPolicySettings,
  useMcapModalSettings,
} from "./mcap-modal-settings";
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
      {focusedTile ? (
        <div className={styles.root}>
          <TimeResolutionSettings />
        </div>
      ) : (
        <GlobalSceneSettings />
      )}
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

      <TimeResolutionSettings />

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

function TimeResolutionSettings() {
  const { resetTemporalPolicy, setTemporalPolicy, temporalPolicy } =
    useMcapModalSettings();

  return (
    <TemporalPolicySettings
      onReset={resetTemporalPolicy}
      onUpdate={setTemporalPolicy}
      policy={temporalPolicy}
    />
  );
}

function TemporalPolicySettings({
  onReset,
  onUpdate,
  policy,
}: {
  readonly onReset: () => void;
  readonly onUpdate: (policy: Partial<McapTemporalPolicySettings>) => void;
  readonly policy: McapTemporalPolicySettings;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Time synchronization
        </Text>
        <button className={styles.resetButton} onClick={onReset} type="button">
          Reset
        </button>
      </div>
      <div className={styles.policyGroups}>
        <div className={styles.policyGroup}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Observations
          </Text>
          <div className={styles.controlStack}>
            <PolicyNumberInput
              label="Stale frame warning"
              onChange={(staleMediaWarningMs) =>
                onUpdate({ staleMediaWarningMs })
              }
              tooltip="Shows a stale badge when latest-at-or-before observations are older than this threshold. Observation lookup is unbounded and never uses future samples. Enter 0 to disable the warning."
              value={policy.staleMediaWarningMs}
            />
          </div>
        </div>
        <div className={styles.policyGroup}>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Transforms
          </Text>
          <div className={styles.controlStack}>
            <PolicyNumberInput
              label="Max interpolation gap"
              onChange={(maxInterpolationGapMs) =>
                onUpdate({ maxInterpolationGapMs })
              }
              tooltip="Largest gap between bracketing transform samples that can be interpolated. Larger gaps make placement unavailable. Enter 0 to remove the gap limit."
              value={policy.maxInterpolationGapMs}
            />
            <PolicyNumberInput
              label="Large gap warning"
              onChange={(transformGapWarningMs) =>
                onUpdate({ transformGapWarningMs })
              }
              tooltip="Shows a 3D warning when a rendered transform interpolates across a wider gap than this. Rendering continues if the max interpolation gap allows it. Enter 0 to disable the warning."
              value={policy.transformGapWarningMs}
            />
            <PolicyNumberInput
              label="Boundary clamp"
              onChange={(boundaryClampMs) => onUpdate({ boundaryClampMs })}
              tooltip="Start/end tolerance for using the nearest transform sample when a full interpolation bracket does not exist. Enter 0 to disable boundary clamping."
              value={policy.boundaryClampMs}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PolicyNumberInput({
  label,
  onChange,
  tooltip,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: number) => void;
  readonly tooltip: string;
  readonly value: number;
}) {
  return (
    <label className={styles.controlRow}>
      <ControlLabel label={label} tooltip={tooltip} />
      <span className={styles.numberInputWrap}>
        <input
          aria-label={label}
          className={styles.numberInput}
          max={60_000}
          min={0}
          onChange={(event) => onChange(Number(event.target.value))}
          step={1}
          type="number"
          value={value}
        />
        <span className={styles.unitLabel}>ms</span>
      </span>
    </label>
  );
}

function ControlLabel({
  label,
  tooltip,
}: {
  readonly label: string;
  readonly tooltip: string;
}) {
  return (
    <span className={styles.labelWithTooltip}>
      <span className={styles.controlLabel}>{label}</span>
      <span
        aria-label={tooltip}
        className={styles.tooltipIcon}
        data-tooltip={tooltip}
        role="img"
        tabIndex={0}
      >
        ?
      </span>
    </span>
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
    labels: sources.filter(
      (s) =>
        s.type === MCAP_SOURCE_TYPE.IMAGE_ANNOTATION ||
        s.type === MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
    ).length,
    pointClouds: sources.filter((s) => s.type === MCAP_SOURCE_TYPE.POINT_CLOUD)
      .length,
  };
}

export default McapSettingsSidebar;
