import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox } from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import {
  useMcapRawMessageContext,
  type McapRawTopicInfo,
} from "./mcap-raw-message-context";
import {
  useMcapRawTileTopic,
  useSetMcapRawTileTopic,
} from "./mcap-raw-tile-state";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import plotStyles from "./McapPlotTile.module.css";
import rawStyles from "./McapRawMessageTile.module.css";
import settingsStyles from "./McapTile.settings.module.css";

/**
 * Settings sidebar for the raw message tile: every topic in the
 * recording — including topics no visualization can render, which is
 * the tile's reason to exist — with a filter box and single-select
 * rows. Renders through the tiling settings portal, so it only appears
 * while this tile is focused.
 */
const McapRawMessageTileSettings: React.FC = () => {
  const { ensureTopics, topics } = useMcapRawMessageContext();
  const selectedTopic = useMcapRawTileTopic();
  const setTopic = useSetMcapRawTileTopic();
  const [filter, setFilter] = useState("");

  // This effect kicks the topic inventory read the first time any raw
  // tile is focused.
  useEffect(() => {
    ensureTopics();
  }, [ensureTopics]);

  const sorted = useMemo(
    () =>
      [...topics.topics].sort((left, right) =>
        left.topic.localeCompare(right.topic),
      ),
    [topics.topics],
  );
  const filtered = useMemo(
    () => filterTopics(sorted, filter),
    [sorted, filter],
  );

  return (
    <TileSettingsContent>
      <div className={settingsStyles.root} data-cy="mcap-raw-settings">
        {topics.status === "loading" || topics.status === "idle" ? (
          <span className={settingsStyles.emptyText}>Reading topics…</span>
        ) : topics.status === "error" ? (
          <span className={settingsStyles.emptyText}>
            Could not read this recording&apos;s topics
          </span>
        ) : sorted.length === 0 ? (
          <span className={settingsStyles.emptyText}>
            No topics in this recording
          </span>
        ) : (
          <>
            <input
              className={plotStyles.filterInput}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter topics"
              type="text"
              value={filter}
            />
            <div className={settingsStyles.optionStack}>
              {filtered.map((topic) => (
                <RawTopicRow
                  key={topic.topic}
                  onSelect={setTopic}
                  selected={topic.topic === selectedTopic}
                  topic={topic}
                />
              ))}
              {filtered.length === 0 ? (
                <span className={settingsStyles.emptyText}>
                  Nothing matches &quot;{filter}&quot;
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </TileSettingsContent>
  );
};

function RawTopicRow({
  onSelect,
  selected,
  topic,
}: {
  readonly onSelect: (topic: string | null) => void;
  readonly selected: boolean;
  readonly topic: McapRawTopicInfo;
}) {
  const caption = [
    topic.schemaName ?? "no schema",
    topic.messageEncoding,
    topic.messageCount !== null
      ? `${topic.messageCount.toLocaleString()} msgs`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={plotStyles.fieldRow}
      data-cy={`mcap-raw-topic-${topic.topic}`}
      title={caption}
    >
      <Checkbox
        checked={selected}
        label={topic.topic}
        onChange={(checked) => onSelect(checked ? topic.topic : null)}
        {...checkboxNoSpaceToggleProps}
      />
      <span className={rawStyles.truncatedText}>{topic.messageEncoding}</span>
    </div>
  );
}

/**
 * Case-insensitive filter over topic names and schema names.
 */
function filterTopics(
  topics: readonly McapRawTopicInfo[],
  filter: string,
): readonly McapRawTopicInfo[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return topics;
  }

  return topics.filter(
    (topic) =>
      topic.topic.toLowerCase().includes(needle) ||
      (topic.schemaName?.toLowerCase().includes(needle) ?? false),
  );
}

export default McapRawMessageTileSettings;
