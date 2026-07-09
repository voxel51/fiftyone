import { useTiling } from "@fiftyone/tiling";
import {
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
import type { StreamInventory } from "../../../schemas/v1";
import {
  type McapPlaybackFidelityMode,
  type McapTemporalPolicySettings,
  useMcapPlaybackSettings,
  useMcapTemporalPolicySettings,
} from "./mcap-modal-settings";
import McapSidebarGroup from "./McapSidebarGroup";
import styles from "./McapSettingsSidebar.module.css";
import McapTopicsSettings from "./McapTopicsSettings";

type ActiveSettingsTab = "panel" | "scene" | "topics";

/**
 * MCAP-specific left sidebar. Panel settings stay on an explicit tab while
 * scene-wide settings are available without stealing focus from the active
 * panel.
 */
const McapSettingsSidebar: React.FC<{
  readonly topics?: readonly StreamInventory[];
}> = ({ topics = [] }) => {
  const { focusedTileId, setSettingsSlotEl, tiles } = useTiling();
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const focusedTileTitle = focusedTile?.title ?? null;
  const hasPanelTab = focusedTileTitle !== null;
  const [activeTab, setActiveTab] = useState<ActiveSettingsTab>("scene");
  const hadPanelTabRef = useRef(false);
  const suppressNextPanelAutoSwitchRef = useRef(false);
  const slotRef = useCallback(
    (el: HTMLDivElement | null) => setSettingsSlotEl(el),
    [setSettingsSlotEl],
  );
  const suppressNextPanelAutoSwitch = useCallback(() => {
    suppressNextPanelAutoSwitchRef.current = true;
  }, []);

  useLayoutEffect(() => {
    const suppressPanelAutoSwitch = suppressNextPanelAutoSwitchRef.current;
    if (hasPanelTab && !hadPanelTabRef.current) {
      if (!suppressPanelAutoSwitch) {
        setActiveTab("panel");
      }
    } else if (!hasPanelTab && activeTab === "panel") {
      setActiveTab("scene");
    }
    suppressNextPanelAutoSwitchRef.current = false;
    hadPanelTabRef.current = hasPanelTab;
  }, [activeTab, hasPanelTab]);

  const tabs = useMemo<Descriptor<ToggleSwitchTab>[]>(() => {
    const nextTabs: Descriptor<ToggleSwitchTab>[] = [
      {
        id: "scene",
        data: {
          label: "Scene",
          content: <GlobalSceneSettings />,
        },
      },
      {
        id: "topics",
        data: {
          label: "Topics",
          content: (
            <McapTopicsSettings
              onTopicActionStart={suppressNextPanelAutoSwitch}
              topics={topics}
            />
          ),
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
  }, [focusedTileTitle, slotRef, suppressNextPanelAutoSwitch, topics]);
  const selectedTab =
    hasPanelTab &&
    !hadPanelTabRef.current &&
    !suppressNextPanelAutoSwitchRef.current
      ? "panel"
      : activeTab;
  const defaultIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selectedTab),
  );
  const handleTabChange = useCallback(
    (index: number) => {
      setActiveTab(
        (tabs[index]?.id as ActiveSettingsTab | undefined) ?? "scene",
      );
    },
    [tabs],
  );

  return (
    <div className={styles.sidebarRoot}>
      <ToggleSwitch
        key={hasPanelTab ? "with-panel" : "scene-only"}
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
  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <PlaybackFidelitySettings />
      <TimeResolutionSettings />
    </div>
  );
}

const FIDELITY_OPTIONS: readonly {
  readonly label: string;
  readonly value: McapPlaybackFidelityMode;
}[] = [
  { label: "Smooth", value: "smooth" },
  { label: "As recorded", value: "as-recorded" },
];

function PlaybackFidelitySettings() {
  const { fidelityMode, setFidelityMode } = useMcapPlaybackSettings();

  return (
    <McapSidebarGroup title="Playback">
      <div className={styles.controlStack}>
        <label className={styles.controlRow}>
          <ControlLabel
            label="Between samples"
            tooltip="Smooth interpolates continuous signals — transforms and 2D/3D label geometry — between recorded samples for fluid playback. As recorded never synthesizes: every signal holds its latest recorded sample, so the scene only shows values that exist in the recording."
          />
          <select
            aria-label="Between samples"
            className={styles.modeSelect}
            onChange={(event) =>
              setFidelityMode(event.target.value as McapPlaybackFidelityMode)
            }
            value={fidelityMode}
          >
            {FIDELITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </McapSidebarGroup>
  );
}

function TimeResolutionSettings() {
  const { resetTemporalPolicy, setTemporalPolicy, temporalPolicy } =
    useMcapTemporalPolicySettings();

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
    <McapSidebarGroup defaultExpanded={false} title="Advanced timing">
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
      <button className={styles.resetButton} onClick={onReset} type="button">
        Reset to defaults
      </button>
    </McapSidebarGroup>
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
