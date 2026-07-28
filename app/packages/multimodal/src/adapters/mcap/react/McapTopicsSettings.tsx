import { useTiling } from "@fiftyone/tiling";
import { Input, InputType, Size } from "@voxel51/voodo";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useSceneInventory } from "../../../scene-inventory/SceneInventoryProvider";
import type { StreamInventory } from "../../../schemas/v1";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import {
  MCAP_TOPIC_CAPABILITY,
  MCAP_TOPIC_CAPABILITY_LABEL,
  MCAP_TOPIC_CATEGORY,
  MCAP_TOPIC_CATEGORY_LABEL,
  MCAP_TOPIC_CATEGORY_ORDER,
  MCAP_TOPIC_SUPPORT_LABEL,
  buildMcapTopicInventoryRows,
  filterMcapTopicInventoryRows,
  type McapTopicInventoryRow,
} from "../topic-inventory";
import McapSidebarGroup from "./McapSidebarGroup";
import styles from "./McapSettingsSidebar.module.css";
import { MCAP_TILE_TYPE, type McapTileType } from "./mcap-tile-types";
import { getMcapTileDefinition } from "./use-mcap-tiles";
import { useOpenMcapImageTile } from "./use-open-mcap-image-tile";
import { useOpenMcapRawMessageTile } from "./use-open-mcap-raw-message-tile";

const TOPICS_SEARCH_THRESHOLD = 5;

const McapTopicsSettings: React.FC<{
  readonly onTopicActionStart?: () => void;
  readonly topics: readonly StreamInventory[];
}> = ({ onTopicActionStart, topics }) => {
  const sceneSources = useSceneInventory();
  const openImageTile = useOpenMcapImageTile();
  const openRawMessageTile = useOpenMcapRawMessageTile();
  const open3dTile = useOpenMcapPanelTile(MCAP_TILE_TYPE.THREE_D);
  const openLogTile = useOpenMcapPanelTile(MCAP_TILE_TYPE.LOG);
  const openMapTile = useOpenMcapPanelTile(MCAP_TILE_TYPE.MAP);
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => buildMcapTopicInventoryRows({ sceneSources, topics }),
    [sceneSources, topics],
  );
  const showSearch = rows.length > TOPICS_SEARCH_THRESHOLD;
  const filteredRows = useMemo(
    () => (showSearch ? filterMcapTopicInventoryRows(rows, search) : rows),
    [rows, search, showSearch],
  );
  const groups = useMemo(() => {
    const rowsByCategory = new Map<
      McapTopicInventoryRow["category"],
      McapTopicInventoryRow[]
    >();
    for (const row of filteredRows) {
      const categoryRows = rowsByCategory.get(row.category);
      if (categoryRows) {
        categoryRows.push(row);
      } else {
        rowsByCategory.set(row.category, [row]);
      }
    }

    return MCAP_TOPIC_CATEGORY_ORDER.map((category) => ({
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
        <span className={styles.topicEmpty}>No topics found</span>
      ) : (
        <>
          {showSearch ? (
            <div className={styles.stickyTopicSearch}>
              <Input
                aria-label="Search topics"
                className={styles.topicSearchInput}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search topics"
                size={Size.Sm}
                type={InputType.Search}
                value={search}
              />
            </div>
          ) : null}
          <div className={styles.topicGroups}>
            {groups.map((group) => (
              <McapSidebarGroup
                key={group.category}
                summary={topicCountLabel(group.rows.length)}
                title={MCAP_TOPIC_CATEGORY_LABEL[group.category]}
              >
                <div className={styles.topicList}>
                  {group.rows.map((row) => (
                    <TopicRow
                      actionHandlers={actionHandlers}
                      key={row.topic}
                      onTopicActionStart={onTopicActionStart}
                      row={row}
                    />
                  ))}
                </div>
              </McapSidebarGroup>
            ))}
            {filteredRows.length === 0 ? (
              <span className={styles.topicEmpty}>
                No topics match &quot;{search}&quot;
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

function TopicRow({
  actionHandlers,
  onTopicActionStart,
  row,
}: {
  readonly actionHandlers: TopicActionHandlers;
  readonly onTopicActionStart?: () => void;
  readonly row: McapTopicInventoryRow;
}) {
  const actions = topicActionsForRow(row, actionHandlers);
  const statusLabel = visibleTopicStatusLabel(row);
  const capabilitySummary = row.capabilities
    .map((capability) => MCAP_TOPIC_CAPABILITY_LABEL[capability])
    .join(" · ");

  return (
    <div className={styles.topicRow} title={topicDetails(row)}>
      <div className={styles.topicRowHeader}>
        <span className={styles.topicName}>{row.topic}</span>
        {statusLabel ? (
          <span className={styles.topicStatus}>{statusLabel}</span>
        ) : null}
      </div>
      <div className={styles.topicMetaLine}>
        <span className={styles.topicMeta}>
          {row.countLabel}
          {capabilitySummary ? ` · ${capabilitySummary}` : ""}
        </span>
        <div className={styles.topicActions}>
          {actions.map((action) => (
            <button
              aria-label={action.ariaLabel}
              className={styles.topicActionButton}
              key={action.id}
              onClick={() => {
                onTopicActionStart?.();
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

interface TopicActionHandlers {
  readonly open3dTile: () => void;
  readonly openImageTile: (sourceId: string) => void;
  readonly openLogTile: () => void;
  readonly openMapTile: () => void;
  readonly openRawMessageTile: (topic: string) => void;
}

interface TopicAction {
  readonly ariaLabel: string;
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
}

function topicActionsForRow(
  row: McapTopicInventoryRow,
  handlers: TopicActionHandlers,
): readonly TopicAction[] {
  const actions: TopicAction[] = [];

  if (row.sourceType === MCAP_SOURCE_TYPE.IMAGE) {
    actions.push({
      ariaLabel: `Image ${row.topic}`,
      id: "image",
      label: "Image",
      onClick: () => handlers.openImageTile(row.topic),
    });
  }

  if (
    row.category !== MCAP_TOPIC_CATEGORY.TRANSFORMS_POSES &&
    row.capabilities.includes(MCAP_TOPIC_CAPABILITY.THREE_D)
  ) {
    actions.push({
      ariaLabel: `3D ${row.topic}`,
      id: "3d",
      label: "3D",
      onClick: handlers.open3dTile,
    });
  }

  if (row.capabilities.includes(MCAP_TOPIC_CAPABILITY.LOGS)) {
    actions.push({
      ariaLabel: `Logs ${row.topic}`,
      id: "logs",
      label: "Logs",
      onClick: handlers.openLogTile,
    });
  }

  if (row.capabilities.includes(MCAP_TOPIC_CAPABILITY.MAP)) {
    actions.push({
      ariaLabel: `Map ${row.topic}`,
      id: "map",
      label: "Map",
      onClick: handlers.openMapTile,
    });
  }

  actions.push({
    ariaLabel: `Inspect ${row.topic}`,
    id: "inspect",
    label: "Inspect",
    onClick: () => handlers.openRawMessageTile(row.topic),
  });

  return actions;
}

function visibleTopicStatusLabel(row: McapTopicInventoryRow): string | null {
  if (
    row.supportStatus === "renderable" ||
    row.supportStatus === "inspectable"
  ) {
    return null;
  }
  return MCAP_TOPIC_SUPPORT_LABEL[row.supportStatus];
}

function useOpenMcapPanelTile(type: McapTileType): () => void {
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

    const definition = getMcapTileDefinition(type);
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

function topicDetails(row: McapTopicInventoryRow): string {
  return [
    row.schemaName,
    row.encoding,
    MCAP_TOPIC_CATEGORY_LABEL[row.category],
    MCAP_TOPIC_SUPPORT_LABEL[row.supportStatus],
  ].join(" · ");
}

function topicCountLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "topic" : "topics"}`;
}

export default McapTopicsSettings;
