import { useTiling } from "@fiftyone/tiling";
import { useStreamValues } from "@fiftyone/playback";
import {
  Align,
  Card,
  CardBackground,
  Icon,
  IconColor,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
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
import { useSceneSourcesByType } from "../../../scene-inventory";
import type { PointCloudVisualization } from "../../../decoders";
import { MAX_POINT_CLOUD_RENDER_POINTS } from "../../../decoders";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import type { McapTopicPlaybackFrame } from "./use-mcap-topic-stream";
import {
  type McapPlaybackFidelityMode,
  type McapTemporalPolicySettings,
  useMcapPlaybackSettings,
  useMcapTemporalPolicySettings,
} from "./mcap-modal-settings";
import McapSidebarGroup from "./McapSidebarGroup";
import McapPerformanceStats from "./McapPerformanceStats";
import styles from "./McapSettingsSidebar.module.css";
import McapTopicsSettings from "./McapTopicsSettings";
import McapViewpointSettings from "./McapViewpointSettings";

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
  const sampling = usePointCloudSamplingState();
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
          content: (
            <GlobalSceneSettings
              preferredTileId={focusedTileId}
              sampling={sampling}
            />
          ),
        },
      },
      {
        id: "topics",
        data: {
          label: "Topics",
          content: (
            <TopicsSettingsContent sampling={sampling}>
              <McapTopicsSettings
                onTopicActionStart={suppressNextPanelAutoSwitch}
                topics={topics}
              />
            </TopicsSettingsContent>
          ),
        },
      },
    ];

    if (focusedTileTitle) {
      nextTabs.push({
        id: "panel",
        data: {
          label: focusedTileTitle,
          content: (
            <PanelSettingsContent sampling={sampling} slotRef={slotRef} />
          ),
        },
      });
    }

    return nextTabs;
  }, [
    focusedTileId,
    focusedTileTitle,
    sampling,
    slotRef,
    suppressNextPanelAutoSwitch,
    topics,
  ]);
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
        tabListClassName={styles.stickyTabList}
        tabs={tabs}
      />
    </div>
  );
};

function TopicsSettingsContent({
  children,
  sampling,
}: {
  readonly children: React.ReactNode;
  readonly sampling: PointCloudSamplingState | null;
}) {
  return (
    <div className={styles.root}>
      <PointCloudSamplingWarning sampling={sampling} />
      {children}
    </div>
  );
}

function PanelSettingsContent({
  sampling,
  slotRef,
}: {
  readonly sampling: PointCloudSamplingState | null;
  readonly slotRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <PointCloudSamplingWarning sampling={sampling} />
      <div ref={slotRef} />
    </div>
  );
}

function GlobalSceneSettings({
  preferredTileId,
  sampling,
}: {
  readonly preferredTileId?: string | null;
  readonly sampling: PointCloudSamplingState | null;
}) {
  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <PointCloudSamplingWarning sampling={sampling} />
      <McapViewpointSettings preferredTileId={preferredTileId} />
      <McapPerformanceStats sampling={sampling} />
      <PlaybackFidelitySettings />
      <TimeResolutionSettings />
    </div>
  );
}

interface PointCloudSamplingState {
  readonly sampledCloudCount: number;
  readonly largestFinitePointCount: number;
}

function usePointCloudSamplingState(): PointCloudSamplingState | null {
  const pointCloudSources = useSceneSourcesByType(MCAP_SOURCE_TYPE.POINT_CLOUD);
  const topicIds = useMemo(
    () => pointCloudSources.map((source) => source.id),
    [pointCloudSources],
  );
  const frames =
    useStreamValues<McapTopicPlaybackFrame<PointCloudVisualization> | null>(
      topicIds,
    );

  let sampledCloudCount = 0;
  let largestFinitePointCount = 0;
  for (const playbackFrame of frames) {
    const payload = playbackFrame?.frame.renderPayload;
    if (!payload || payload.finitePointCount <= payload.sampledPointCount) {
      continue;
    }
    sampledCloudCount++;
    largestFinitePointCount = Math.max(
      largestFinitePointCount,
      payload.finitePointCount,
    );
  }

  return sampledCloudCount > 0
    ? { largestFinitePointCount, sampledCloudCount }
    : null;
}

function PointCloudSamplingWarning({
  sampling,
}: {
  readonly sampling: PointCloudSamplingState | null;
}) {
  if (!sampling) return null;

  const description =
    sampling.sampledCloudCount === 1
      ? `Showing ${MAX_POINT_CLOUD_RENDER_POINTS.toLocaleString()} of ${sampling.largestFinitePointCount.toLocaleString()} points.`
      : `${sampling.sampledCloudCount.toLocaleString()} point clouds exceed the ${MAX_POINT_CLOUD_RENDER_POINTS.toLocaleString()}-point display limit.`;

  return (
    <Card background={CardBackground.Secondary} compact outlined>
      <Stack
        align={Align.Start}
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
      >
        <Icon
          color={IconColor.Warning}
          name={IconName.Warning}
          size={Size.Sm}
        />
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          <Text color={TextColor.Warning} variant={TextVariant.Sm}>
            Point cloud sampled for display
          </Text>
          <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
            {description}
          </Text>
        </Stack>
      </Stack>
    </Card>
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
