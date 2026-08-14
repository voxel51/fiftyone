import { TileIdScope, useTiling } from "@fiftyone/tiling";
import type { Descriptor, ToggleSwitchTab } from "@voxel51/voodo";
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EpisodeRecordingFacts, StreamDescriptor } from "../../../../ir";
import type { EpisodeTerminology } from "../../../../ports";
import {
  useTileSettings,
  type TileSettingsRegistration,
} from "../../tiles/tile-settings-context";
import PerformanceStats from "../../status/PerformanceStats";
import EpisodeSidebarTabs from "../controls/EpisodeSidebarTabs";
import { SceneStatusStrip, usePointCloudSamplingSummary } from "./SceneStatus";
import SceneWorldSettings from "./SceneWorldSettings";
import styles from "./SettingsSidebar.module.css";
import { TileStreamNoticeStrip } from "../../tiles/TileStreamState";
import StreamsSettings from "./StreamsSettings";
import TimelinePlaybackSettings from "./TimelinePlaybackSettings";
import RecordingSettings from "./RecordingSettings";

type ActiveSettingsTab = "panel" | "scene" | "streams";
type StreamTerminology = NonNullable<EpisodeTerminology["stream"]>;

const DEFAULT_STREAM_TERMINOLOGY: StreamTerminology = {
  plural: "streams",
  singular: "stream",
};

/**
 * episode-specific left sidebar. Each tab is one scope of the viewer's
 * information hierarchy and shows only that scope's facts:
 *
 * - **Scene** — the shared world: scene-wide status, coordinate system,
 *   playback sampling, and opt-in diagnostics. Nothing here reaches into a
 *   single tile.
 * - **stream catalog** — the recording's catalog: what streams exist and what
 *   can be opened from them. Its visible name is selected by the format.
 * - **\<focused tile\>** — everything about one view: its stream status,
 *   camera, layers, and appearance. Content comes from the tile-settings
 *   registry.
 */
const SettingsSidebar: React.FC<{
  readonly onTimelineSamplingRateChange: (rateHz: number) => void;
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly streams?: readonly StreamDescriptor[];
  readonly terminology?: EpisodeTerminology;
  readonly timelineSamplingRateHz: number;
}> = ({
  onTimelineSamplingRateChange,
  recordingFacts,
  streams = [],
  terminology,
  timelineSamplingRateHz,
}) => {
  const streamTerminology = terminology?.stream ?? DEFAULT_STREAM_TERMINOLOGY;
  const { focusedTileId, tiles } = useTiling();
  const registeredPanelSettings = useTileSettings(focusedTileId);
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
          content: (
            <GlobalSceneSettings
              onTimelineSamplingRateChange={onTimelineSamplingRateChange}
              recordingFacts={recordingFacts}
              timelineSamplingRateHz={timelineSamplingRateHz}
            />
          ),
        },
      },
      {
        id: "streams",
        data: {
          label: titleCase(streamTerminology.plural),
          content: (
            <StreamsSettings
              onStreamActionStart={suppressNextPanelAutoSwitch}
              streams={streams}
              terminology={streamTerminology}
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
    streamTerminology,
    suppressNextPanelAutoSwitch,
    streams,
    onTimelineSamplingRateChange,
    recordingFacts,
    timelineSamplingRateHz,
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
    <EpisodeSidebarTabs
      defaultIndex={defaultIndex}
      onChange={handleTabChange}
      remountKey={hasPanelTab ? "with-panel" : "scene-only"}
      tabs={tabs}
    />
  );
};

function titleCase(label: string): string {
  return label
    ? `${label.charAt(0).toLocaleUpperCase()}${label.slice(1)}`
    : label;
}

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
  readonly registration: TileSettingsRegistration | null;
  readonly tileId: string | null;
}) {
  return (
    <div className={styles.root}>
      {registration && tileId ? (
        <TileIdScope tileId={tileId}>
          {registration.streamStreams?.length ? (
            <TileStreamNoticeStrip streams={registration.streamStreams} />
          ) : null}
          {registration.content}
        </TileIdScope>
      ) : null}
    </div>
  );
}

/**
 * The Scene tab: status first, followed by episode-wide world and playback
 * settings, then opt-in performance diagnostics.
 */
function GlobalSceneSettings({
  onTimelineSamplingRateChange,
  recordingFacts,
  timelineSamplingRateHz,
}: {
  readonly onTimelineSamplingRateChange: (rateHz: number) => void;
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly timelineSamplingRateHz: number;
}) {
  const sampling = usePointCloudSamplingSummary();

  return (
    <div className={styles.root}>
      <SceneStatusStrip recordingFacts={recordingFacts} sampling={sampling} />
      <RecordingSettings facts={recordingFacts} />
      <SceneWorldSettings />
      <TimelinePlaybackSettings
        onRateChange={onTimelineSamplingRateChange}
        rateHz={timelineSamplingRateHz}
      />
      <PerformanceStats sampling={sampling} />
    </div>
  );
}

export default SettingsSidebar;
