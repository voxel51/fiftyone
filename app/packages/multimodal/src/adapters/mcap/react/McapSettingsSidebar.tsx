import { useTiling } from "@fiftyone/tiling";
import {
  Checkbox,
  Size,
  Text,
  TextColor,
  TextVariant,
  ToggleSwitch,
} from "@voxel51/voodo";
import type { Descriptor, ToggleSwitchTab } from "@voxel51/voodo";
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type McapTemporalPolicySettings,
  useMcapModalSettings,
} from "./mcap-modal-settings";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import styles from "./McapSettingsSidebar.module.css";

type ActiveSettingsTab = "scene" | "panel";

/**
 * MCAP-specific left sidebar. Panel settings stay on an explicit tab while
 * scene-wide settings are available without stealing focus from the active
 * panel.
 */
const McapSettingsSidebar: React.FC = () => {
  const { focusedTileId, setSettingsSlotEl, tiles } = useTiling();
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const focusedTileTitle = focusedTile?.title ?? null;
  const hasPanelTab = focusedTileTitle !== null;
  const [activeTab, setActiveTab] = useState<ActiveSettingsTab>("scene");
  const hadPanelTabRef = useRef(false);
  const slotRef = useCallback(
    (el: HTMLDivElement | null) => setSettingsSlotEl(el),
    [setSettingsSlotEl],
  );

  useLayoutEffect(() => {
    if (hasPanelTab && !hadPanelTabRef.current) {
      setActiveTab("panel");
    } else if (!hasPanelTab) {
      setActiveTab("scene");
    }
    hadPanelTabRef.current = hasPanelTab;
  }, [hasPanelTab]);

  const tabs = useMemo<Descriptor<ToggleSwitchTab>[]>(() => {
    const nextTabs: Descriptor<ToggleSwitchTab>[] = [
      {
        id: "scene",
        data: {
          label: "Scene",
          content: <GlobalSceneSettings />,
        },
      },
    ];

    if (focusedTileTitle) {
      nextTabs.push({
        id: "panel",
        data: {
          label: focusedTileTitle,
          content: <PanelSettingsContent slotRef={slotRef} />,
        },
      });
    }

    return nextTabs;
  }, [focusedTileTitle, slotRef]);
  const defaultIndex = activeTab === "panel" && hasPanelTab ? 1 : 0;
  const handleTabChange = useCallback(
    (index: number) => {
      setActiveTab(index === 1 && hasPanelTab ? "panel" : "scene");
    },
    [hasPanelTab],
  );

  return (
    <div className={styles.sidebarRoot}>
      <ToggleSwitch
        key={`${hasPanelTab ? "with-panel" : "scene-only"}-${defaultIndex}`}
        defaultIndex={defaultIndex}
        fullWidth
        onChange={handleTabChange}
        size={Size.Sm}
        tabs={tabs}
      />
    </div>
  );
};

function PanelSettingsContent({
  slotRef,
}: {
  readonly slotRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <div ref={slotRef} />
    </div>
  );
}

function GlobalSceneSettings() {
  const {
    interpolate2dAnnotations,
    interpolate3dAnnotations,
    setInterpolate2dAnnotations,
    setInterpolate3dAnnotations,
  } = useMcapModalSettings();

  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
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

export default McapSettingsSidebar;
