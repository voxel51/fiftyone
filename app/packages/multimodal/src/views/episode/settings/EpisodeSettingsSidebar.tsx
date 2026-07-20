import { TileIdScope, useTiling } from "@fiftyone/tiling";
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
  type EpisodePlaybackFidelityMode,
  type EpisodeTemporalPolicySettings,
  useEpisodePlaybackSettings,
  useEpisodeTemporalPolicySettings,
} from "./episode-modal-settings";
import {
  useEpisodeTileSettings,
  type EpisodeTileSettingsRegistration,
} from "../tiles/episode-tile-settings-context";
import EpisodePerformanceStats from "./EpisodePerformanceStats";
import {
  EpisodeSceneStatusStrip,
  usePointCloudSamplingSummary,
} from "../scene/EpisodeSceneStatus";
import EpisodeSceneWorldSettings from "../scene/EpisodeSceneWorldSettings";
import { EpisodeSettingsNumberField } from "./EpisodeSettingsNumberField";
import EpisodeSidebarGroup from "./EpisodeSidebarGroup";
import styles from "./EpisodeSettingsSidebar.module.css";
import { EpisodeTileStreamNoticeStrip } from "../tiles/EpisodeTileStreamState";
import EpisodeStreamsSettings from "./EpisodeStreamsSettings";

type ActiveSettingsTab = "panel" | "scene" | "streams";

/**
 * episode-specific left sidebar. Each tab is one scope of the viewer's
 * information hierarchy and shows only that scope's facts:
 *
 * - **Scene** — the shared world and its time: scene-wide status, the
 *   coordinate system (world frame, up axis), playback time semantics, and
 *   opt-in diagnostics. Nothing here reaches into a single tile.
 * - **Streams** — the recording's catalog: what streams exist and what can
 *   be opened from them.
 * - **\<focused tile\>** — everything about one view: its stream status,
 *   camera, layers, and appearance. Content comes from the tile-settings
 *   registry.
 */
const EpisodeSettingsSidebar: React.FC<{
  readonly streams?: readonly StreamInventory[];
}> = ({ streams = [] }) => {
  const { focusedTileId, tiles } = useTiling();
  const registeredPanelSettings = useEpisodeTileSettings(focusedTileId);
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const focusedTileTitle = focusedTile?.title ?? null;
  const hasPanelTab = focusedTileTitle !== null;
  const [activeTab, setActiveTab] = useState<ActiveSettingsTab>("scene");
  const hadPanelTabRef = useRef(false);
  const suppressNextPanelAutoSwitchRef = useRef(false);
  const suppressNextPanelAutoSwitch = useCallback(() => {
    suppressNextPanelAutoSwitchRef.current = true;
  }, []);

  // This layout effect opens a newly available panel tab and restores the
  // scene tab before paint when the focused panel disappears.
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
        id: "streams",
        data: {
          label: "Streams",
          content: (
            <EpisodeStreamsSettings
              onStreamActionStart={suppressNextPanelAutoSwitch}
              streams={streams}
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
          content: (
            <PanelSettingsContent
              registration={registeredPanelSettings}
              tileId={focusedTileId}
            />
          ),
        },
      });
    }

    return nextTabs;
  }, [
    focusedTileId,
    focusedTileTitle,
    registeredPanelSettings,
    suppressNextPanelAutoSwitch,
    streams,
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

/**
 * The focused tile's settings, framed by the sidebar: registry-backed
 * tiles render as ordinary children inside a `TileIdScope` so their
 * tileId-scoped hooks resolve, below the tile's stream-status strip when
 * the registration declares streams.
 */
function PanelSettingsContent({
  registration,
  tileId,
}: {
  readonly registration: EpisodeTileSettingsRegistration | null;
  readonly tileId: string | null;
}) {
  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      {registration && tileId ? (
        <TileIdScope tileId={tileId}>
          {registration.streamStreams?.length ? (
            <EpisodeTileStreamNoticeStrip
              streams={registration.streamStreams}
            />
          ) : null}
          {registration.content}
        </TileIdScope>
      ) : null}
    </div>
  );
}

/**
 * The Scene tab: status first, then the world's coordinate system, then how
 * playback interprets time, then opt-in diagnostics last — configuration
 * reads top-down from "is the scene healthy" to "how do I debug it".
 */
function GlobalSceneSettings() {
  const sampling = usePointCloudSamplingSummary();

  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <EpisodeSceneStatusStrip sampling={sampling} />
      <EpisodeSceneWorldSettings />
      <PlaybackFidelitySettings />
      <TimeResolutionSettings />
      <EpisodePerformanceStats sampling={sampling} />
    </div>
  );
}

const FIDELITY_OPTIONS: readonly {
  readonly label: string;
  readonly value: EpisodePlaybackFidelityMode;
}[] = [
  { label: "Smooth", value: "smooth" },
  { label: "As recorded", value: "as-recorded" },
];

function PlaybackFidelitySettings() {
  const { fidelityMode, setFidelityMode } = useEpisodePlaybackSettings();

  return (
    <EpisodeSidebarGroup title="Playback">
      <div className={styles.controlStack}>
        <label className={styles.controlRow}>
          <ControlLabel
            label="Between messages"
            tooltip="Smooth interpolates continuous signals — transforms and 2D/3D label geometry — between recorded messages for fluid playback. As recorded never synthesizes: every signal holds its latest recorded message, so the scene only shows values that exist in the recording."
          />
          <select
            aria-label="Between messages"
            className={styles.modeSelect}
            onChange={(event) =>
              setFidelityMode(event.target.value as EpisodePlaybackFidelityMode)
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
    </EpisodeSidebarGroup>
  );
}

function TimeResolutionSettings() {
  const { resetTemporalPolicy, setTemporalPolicy, temporalPolicy } =
    useEpisodeTemporalPolicySettings();

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
  readonly onUpdate: (policy: Partial<EpisodeTemporalPolicySettings>) => void;
  readonly policy: EpisodeTemporalPolicySettings;
}) {
  return (
    <EpisodeSidebarGroup defaultExpanded={false} title="Advanced timing">
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
              tooltip="Shows a warning when a rendered transform interpolates across a wider gap than this. Rendering continues if the max interpolation gap allows it. Enter 0 to disable the warning."
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
    </EpisodeSidebarGroup>
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
      <EpisodeSettingsNumberField
        ariaLabel={label}
        max={60_000}
        min={0}
        onCommit={onChange}
        step={50}
        unit="ms"
        value={value}
      />
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

export default EpisodeSettingsSidebar;
