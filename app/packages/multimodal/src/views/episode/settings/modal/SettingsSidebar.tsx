import { TileIdScope, useTiling } from "@fiftyone/tiling";
import { Size, ToggleSwitch } from "@voxel51/voodo";
import type { Descriptor, ToggleSwitchTab } from "@voxel51/voodo";
import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StreamDescriptor } from "../../../../ir";
import type { EpisodeTerminology } from "../../../../ports";
import {
  useTileSettings,
  type TileSettingsRegistration,
} from "../../tiles/tile-settings-context";
import PerformanceStats from "../../status/PerformanceStats";
import { SceneStatusStrip, usePointCloudSamplingSummary } from "./SceneStatus";
import SceneWorldSettings from "./SceneWorldSettings";
import styles from "./SettingsSidebar.module.css";
import { TileStreamNoticeStrip } from "../../tiles/TileStreamState";
import StreamsSettings from "./StreamsSettings";

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
 * - **Scene** — the shared world: scene-wide status, the coordinate system
 *   (world frame, up axis), and opt-in diagnostics. Nothing here reaches into
 *   a single tile.
 * - **stream catalog** — the recording's catalog: what streams exist and what
 *   can be opened from them. Its visible name is selected by the format.
 * - **\<focused tile\>** — everything about one view: its stream status,
 *   camera, layers, and appearance. Content comes from the tile-settings
 *   registry.
 */
const SettingsSidebar: React.FC<{
  readonly streams?: readonly StreamDescriptor[];
  readonly terminology?: EpisodeTerminology;
}> = ({ streams = [], terminology }) => {
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
          content: <GlobalSceneSettings />,
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
    <div className={`${styles.root} ${styles.tabContent}`}>
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
 * The Scene tab: status first, then the world's coordinate system, then opt-in
 * diagnostics last — configuration reads top-down from "is the scene healthy"
 * to "how do I debug it".
 */
function GlobalSceneSettings() {
  const sampling = usePointCloudSamplingSummary();

  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      <SceneStatusStrip sampling={sampling} />
      <SceneWorldSettings />
      <PerformanceStats sampling={sampling} />
    </div>
  );
}

export default SettingsSidebar;
