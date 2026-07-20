import { useTiling } from "@fiftyone/tiling";
import { Input, InputType, Size } from "@voxel51/voodo";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useSceneInventory } from "../../../scene-inventory/SceneInventoryProvider";
import type { StreamInventory } from "../../../schemas/v1";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import {
  EPISODE_STREAM_CAPABILITY,
  EPISODE_STREAM_CAPABILITY_LABEL,
  EPISODE_STREAM_CATEGORY,
  EPISODE_STREAM_CATEGORY_LABEL,
  EPISODE_STREAM_CATEGORY_ORDER,
  EPISODE_STREAM_SUPPORT_LABEL,
  buildEpisodeStreamInventoryRows,
  filterEpisodeStreamInventoryRows,
  type EpisodeStreamInventoryRow,
} from "../inventory/stream-inventory";
import EpisodeSidebarGroup from "./EpisodeSidebarGroup";
import styles from "./EpisodeSettingsSidebar.module.css";
import {
  EPISODE_TILE_TYPE,
  type EpisodeTileType,
} from "../tiles/episode-tile-types";
import { getEpisodeTileDefinition } from "../tiles/use-episode-tiles";
import { useOpenEpisodeImageTile } from "../image/use-open-episode-image-tile";
import { useOpenEpisodeRawMessageTile } from "../raw/use-open-episode-raw-message-tile";

const STREAMS_SEARCH_THRESHOLD = 5;

const EpisodeStreamsSettings: React.FC<{
  readonly onStreamActionStart?: () => void;
  readonly streams: readonly StreamInventory[];
}> = ({ onStreamActionStart, streams }) => {
  const sceneSources = useSceneInventory();
  const openImageTile = useOpenEpisodeImageTile();
  const openRawMessageTile = useOpenEpisodeRawMessageTile();
  const open3dTile = useOpenEpisodePanelTile(EPISODE_TILE_TYPE.THREE_D);
  const openLogTile = useOpenEpisodePanelTile(EPISODE_TILE_TYPE.LOG);
  const openMapTile = useOpenEpisodePanelTile(EPISODE_TILE_TYPE.MAP);
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => buildEpisodeStreamInventoryRows({ sceneSources, streams }),
    [sceneSources, streams],
  );
  const showSearch = rows.length > STREAMS_SEARCH_THRESHOLD;
  const filteredRows = useMemo(
    () => (showSearch ? filterEpisodeStreamInventoryRows(rows, search) : rows),
    [rows, search, showSearch],
  );
  const groups = useMemo(() => {
    const rowsByCategory = new Map<
      EpisodeStreamInventoryRow["category"],
      EpisodeStreamInventoryRow[]
    >();
    for (const row of filteredRows) {
      const categoryRows = rowsByCategory.get(row.category);
      if (categoryRows) {
        categoryRows.push(row);
      } else {
        rowsByCategory.set(row.category, [row]);
      }
    }

    return EPISODE_STREAM_CATEGORY_ORDER.map((category) => ({
      category,
      rows: rowsByCategory.get(category) ?? [],
    })).filter((group) => group.rows.length > 0);
  }, [filteredRows]);
  const actionHandlers = useMemo(
    () => ({
      open3dTile,
      openImageTile,
      openLogTile,
      openMapTile,
      openRawMessageTile,
    }),
    [open3dTile, openImageTile, openLogTile, openMapTile, openRawMessageTile],
  );

  return (
    <div className={`${styles.root} ${styles.tabContent}`}>
      {rows.length === 0 ? (
        <span className={styles.streamEmpty}>No streams found</span>
      ) : (
        <>
          {showSearch ? (
            <div className={styles.stickyStreamSearch}>
              <Input
                aria-label="Search streams"
                className={styles.streamSearchInput}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search streams"
                size={Size.Sm}
                type={InputType.Search}
                value={search}
              />
            </div>
          ) : null}
          <div className={styles.streamGroups}>
            {groups.map((group) => (
              <EpisodeSidebarGroup
                key={group.category}
                summary={streamCountLabel(group.rows.length)}
                title={EPISODE_STREAM_CATEGORY_LABEL[group.category]}
              >
                <div className={styles.streamList}>
                  {group.rows.map((row) => (
                    <StreamRow
                      actionHandlers={actionHandlers}
                      key={row.stream}
                      onStreamActionStart={onStreamActionStart}
                      row={row}
                    />
                  ))}
                </div>
              </EpisodeSidebarGroup>
            ))}
            {filteredRows.length === 0 ? (
              <span className={styles.streamEmpty}>
                No streams match &quot;{search}&quot;
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

function StreamRow({
  actionHandlers,
  onStreamActionStart,
  row,
}: {
  readonly actionHandlers: StreamActionHandlers;
  readonly onStreamActionStart?: () => void;
  readonly row: EpisodeStreamInventoryRow;
}) {
  const actions = streamActionsForRow(row, actionHandlers);
  const statusLabel = visibleStreamStatusLabel(row);
  const capabilitySummary = row.capabilities
    .map((capability) => EPISODE_STREAM_CAPABILITY_LABEL[capability])
    .join(" · ");

  return (
    <div className={styles.streamRow} title={streamDetails(row)}>
      <div className={styles.streamRowHeader}>
        <span className={styles.streamName}>{row.stream}</span>
        {statusLabel ? (
          <span className={styles.streamStatus}>{statusLabel}</span>
        ) : null}
      </div>
      <div className={styles.streamMetaLine}>
        <span className={styles.streamMeta}>
          {row.countLabel}
          {capabilitySummary ? ` · ${capabilitySummary}` : ""}
        </span>
        <div className={styles.streamActions}>
          {actions.map((action) => (
            <button
              aria-label={action.ariaLabel}
              className={styles.streamActionButton}
              key={action.id}
              onClick={() => {
                onStreamActionStart?.();
                action.onClick();
              }}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface StreamActionHandlers {
  readonly open3dTile: () => void;
  readonly openImageTile: (sourceId: string) => void;
  readonly openLogTile: () => void;
  readonly openMapTile: () => void;
  readonly openRawMessageTile: (stream: string) => void;
}

interface StreamAction {
  readonly ariaLabel: string;
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
}

function streamActionsForRow(
  row: EpisodeStreamInventoryRow,
  handlers: StreamActionHandlers,
): readonly StreamAction[] {
  const actions: StreamAction[] = [];

  if (row.sourceType === SCENE_SOURCE_TYPE.IMAGE) {
    actions.push({
      ariaLabel: `Image ${row.stream}`,
      id: "image",
      label: "Image",
      onClick: () => handlers.openImageTile(row.stream),
    });
  }

  if (
    row.category !== EPISODE_STREAM_CATEGORY.TRANSFORMS_POSES &&
    row.capabilities.includes(EPISODE_STREAM_CAPABILITY.THREE_D)
  ) {
    actions.push({
      ariaLabel: `3D ${row.stream}`,
      id: "3d",
      label: "3D",
      onClick: handlers.open3dTile,
    });
  }

  if (row.capabilities.includes(EPISODE_STREAM_CAPABILITY.LOGS)) {
    actions.push({
      ariaLabel: `Logs ${row.stream}`,
      id: "logs",
      label: "Logs",
      onClick: handlers.openLogTile,
    });
  }

  if (row.capabilities.includes(EPISODE_STREAM_CAPABILITY.MAP)) {
    actions.push({
      ariaLabel: `Map ${row.stream}`,
      id: "map",
      label: "Map",
      onClick: handlers.openMapTile,
    });
  }

  actions.push({
    ariaLabel: `Inspect ${row.stream}`,
    id: "inspect",
    label: "Inspect",
    onClick: () => handlers.openRawMessageTile(row.stream),
  });

  return actions;
}

function visibleStreamStatusLabel(
  row: EpisodeStreamInventoryRow,
): string | null {
  if (
    row.supportStatus === "renderable" ||
    row.supportStatus === "inspectable"
  ) {
    return null;
  }
  return EPISODE_STREAM_SUPPORT_LABEL[row.supportStatus];
}

function useOpenEpisodePanelTile(type: EpisodeTileType): () => void {
  const { addTile, setFocusedTileId, tiles } = useTiling();
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  return useCallback(() => {
    const currentTiles = tilesRef.current;
    const existingTileId = Object.keys(currentTiles).find(
      (tileId) => currentTiles[tileId]?.type === type,
    );
    if (existingTileId) {
      setFocusedTileId(existingTileId);
      return;
    }

    const definition = getEpisodeTileDefinition(type);
    if (!definition) {
      return;
    }
    const Tile = definition.Tile;
    const tile = {
      render: () => <Tile />,
      title: definition.typeLabel,
      type,
    };
    const tileId = addTile(tile, { idPrefix: type });
    tilesRef.current = { ...currentTiles, [tileId]: tile };
  }, [addTile, setFocusedTileId, type]);
}

function streamDetails(row: EpisodeStreamInventoryRow): string {
  return [
    row.schemaName,
    row.encoding,
    EPISODE_STREAM_CATEGORY_LABEL[row.category],
    EPISODE_STREAM_SUPPORT_LABEL[row.supportStatus],
  ].join(" · ");
}

function streamCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "stream" : "streams"}`;
}

export default EpisodeStreamsSettings;
