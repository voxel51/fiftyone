import { Input, InputType, Size } from "@voxel51/voodo";
import React, { useMemo, useState } from "react";
import { useSceneInventory } from "../../../../scene-inventory/react";
import { SCENE_SOURCE_TYPE, type StreamDescriptor } from "../../../../ir";
import type { EpisodeTerminology } from "../../../../ports";
import {
  STREAM_CAPABILITY,
  STREAM_CAPABILITY_LABEL,
  STREAM_CATEGORY,
  STREAM_CATEGORY_LABEL,
  STREAM_CATEGORY_ORDER,
  STREAM_SUPPORT_LABEL,
  buildStreamInventoryRows,
  filterStreamInventoryRows,
  type StreamInventoryRow,
} from "../../stream-discovery/stream-inventory";
import SidebarGroup from "../controls/SidebarGroup";
import styles from "./SettingsSidebar.module.css";
import { TILE_TYPE } from "../../tiles/tile-types";
import { useOpenTile } from "../../tiles/use-open-tile";
import { useOpenImageTile } from "../../tiles/use-open-image-tile";
import {
  useOpenRawMessageTile,
  type RawMessageTileTarget,
} from "../../tiles/use-open-raw-message-tile";

const STREAMS_SEARCH_THRESHOLD = 5;

const StreamsSettings: React.FC<{
  readonly onStreamActionStart?: () => void;
  readonly streams: readonly StreamDescriptor[];
  readonly terminology: NonNullable<EpisodeTerminology["stream"]>;
}> = ({ onStreamActionStart, streams, terminology }) => {
  const sceneSources = useSceneInventory();
  const openImageTile = useOpenImageTile();
  const openRawMessageTile = useOpenRawMessageTile();
  const open3dTile = useOpenTile(TILE_TYPE.THREE_D);
  const openLogTile = useOpenTile(TILE_TYPE.LOG);
  const openMapTile = useOpenTile(TILE_TYPE.MAP);
  const [search, setSearch] = useState("");
  const { plural, singular } = terminology;
  const rows = useMemo(
    () => buildStreamInventoryRows({ sceneSources, streams }),
    [sceneSources, streams],
  );
  const showSearch = rows.length > STREAMS_SEARCH_THRESHOLD;
  const filteredRows = useMemo(
    () => (showSearch ? filterStreamInventoryRows(rows, search) : rows),
    [rows, search, showSearch],
  );
  const groups = useMemo(() => {
    const rowsByCategory = new Map<
      StreamInventoryRow["category"],
      StreamInventoryRow[]
    >();
    for (const row of filteredRows) {
      const categoryRows = rowsByCategory.get(row.category);
      if (categoryRows) {
        categoryRows.push(row);
      } else {
        rowsByCategory.set(row.category, [row]);
      }
    }

    return STREAM_CATEGORY_ORDER.map((category) => ({
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
        <span className={styles.streamEmpty}>No {plural} found</span>
      ) : (
        <>
          {showSearch ? (
            <div className={styles.stickyStreamSearch}>
              <Input
                aria-label={`Search ${plural}`}
                className={styles.streamSearchInput}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${plural}`}
                size={Size.Sm}
                type={InputType.Search}
                value={search}
              />
            </div>
          ) : null}
          <div className={styles.streamGroups}>
            {groups.map((group) => (
              <SidebarGroup
                key={group.category}
                summary={streamCountLabel(group.rows.length, singular, plural)}
                title={STREAM_CATEGORY_LABEL[group.category]}
              >
                <div className={styles.streamList}>
                  {group.rows.map((row) => (
                    <StreamRow
                      actionHandlers={actionHandlers}
                      key={row.streamId}
                      onStreamActionStart={onStreamActionStart}
                      row={row}
                    />
                  ))}
                </div>
              </SidebarGroup>
            ))}
            {filteredRows.length === 0 ? (
              <span className={styles.streamEmpty}>
                No {plural} match &quot;{search}&quot;
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
  readonly row: StreamInventoryRow;
}) {
  const actions = streamActionsForRow(row, actionHandlers);
  const statusLabel = visibleStreamStatusLabel(row);
  const capabilitySummary = row.capabilities
    .map((capability) => STREAM_CAPABILITY_LABEL[capability])
    .join(" · ");

  return (
    <div className={styles.streamRow} title={streamDetails(row)}>
      <div className={styles.streamRowHeader}>
        <span className={styles.streamName}>{row.sourceName}</span>
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
  readonly openRawMessageTile: (target: RawMessageTileTarget) => void;
}

interface StreamAction {
  readonly ariaLabel: string;
  readonly id: string;
  readonly label: string;
  readonly onClick: () => void;
}

function streamActionsForRow(
  row: StreamInventoryRow,
  handlers: StreamActionHandlers,
): readonly StreamAction[] {
  const actions: StreamAction[] = [];

  if (row.sourceType === SCENE_SOURCE_TYPE.IMAGE) {
    actions.push({
      ariaLabel: `Image ${row.sourceName}`,
      id: "image",
      label: "Image",
      onClick: () => handlers.openImageTile(row.streamId),
    });
  }

  if (
    row.category !== STREAM_CATEGORY.TRANSFORMS_POSES &&
    row.capabilities.includes(STREAM_CAPABILITY.THREE_D)
  ) {
    actions.push({
      ariaLabel: `3D ${row.sourceName}`,
      id: "3d",
      label: "3D",
      onClick: handlers.open3dTile,
    });
  }

  if (row.capabilities.includes(STREAM_CAPABILITY.LOGS)) {
    actions.push({
      ariaLabel: `Logs ${row.sourceName}`,
      id: "logs",
      label: "Logs",
      onClick: handlers.openLogTile,
    });
  }

  if (row.capabilities.includes(STREAM_CAPABILITY.MAP)) {
    actions.push({
      ariaLabel: `Map ${row.sourceName}`,
      id: "map",
      label: "Map",
      onClick: handlers.openMapTile,
    });
  }

  actions.push({
    ariaLabel: `Inspect ${row.sourceName}`,
    id: "inspect",
    label: "Inspect",
    onClick: () =>
      handlers.openRawMessageTile({
        sourceName: row.sourceName,
        streamId: row.streamId,
      }),
  });

  return actions;
}

function visibleStreamStatusLabel(row: StreamInventoryRow): string | null {
  if (
    row.supportStatus === "renderable" ||
    row.supportStatus === "inspectable"
  ) {
    return null;
  }
  return STREAM_SUPPORT_LABEL[row.supportStatus];
}

function streamDetails(row: StreamInventoryRow): string {
  return [
    row.schemaName,
    row.encoding,
    STREAM_CATEGORY_LABEL[row.category],
    STREAM_SUPPORT_LABEL[row.supportStatus],
  ].join(" · ");
}

function streamCountLabel(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export default StreamsSettings;
