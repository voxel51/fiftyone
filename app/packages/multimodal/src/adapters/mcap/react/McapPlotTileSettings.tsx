import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox } from "@voxel51/voodo";
import React, { useMemo, useState } from "react";
import type { McapTopicNumericFields } from "../types";
import { useMcapNumericSeriesContext } from "./mcap-numeric-series-context";
import {
  type McapPlotSeriesConfig,
  useMcapPlotTileSeries,
  useToggleMcapPlotSeries,
} from "./mcap-plot-tile-state";
import { checkboxNoSpaceToggleProps } from "./mcap-settings-keyboard";
import McapPlotTileStyles from "./McapPlotTile.module.css";
import McapSidebarGroup from "./McapSidebarGroup";
import settingsStyles from "./McapTile.settings.module.css";

/**
 * Settings sidebar for the plot tile: every topic with numeric leaf
 * fields, one checkbox per field, enabled series carrying their color
 * swatch. Topics whose encoding has no extraction path yet are listed
 * disabled — a legible gap beats silent absence. Renders through the
 * tiling settings portal, so it only appears while this tile is
 * focused.
 */
const McapPlotTileSettings: React.FC = () => {
  const { enumeration } = useMcapNumericSeriesContext();
  const seriesConfigs = useMcapPlotTileSeries();
  const toggleSeries = useToggleMcapPlotSeries();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () => filterTopics(enumeration.topics, filter),
    [enumeration.topics, filter],
  );

  return (
    <TileSettingsContent>
      <div className={settingsStyles.root}>
        {enumeration.status === "loading" || enumeration.status === "idle" ? (
          <span className={settingsStyles.emptyText}>Scanning topics…</span>
        ) : enumeration.status === "error" ? (
          <span className={settingsStyles.emptyText}>
            Could not scan this recording&apos;s topics
          </span>
        ) : enumeration.topics.length === 0 ? (
          <span className={settingsStyles.emptyText}>
            No plottable topics in this recording
          </span>
        ) : (
          <>
            <input
              className={McapPlotTileStyles.filterInput}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter topics and fields"
              type="text"
              value={filter}
            />
            {filtered.map((topic) => (
              <PlotTopicGroup
                key={topic.topic}
                seriesConfigs={seriesConfigs}
                toggleSeries={toggleSeries}
                topic={topic}
              />
            ))}
            {filtered.length === 0 ? (
              <span className={settingsStyles.emptyText}>
                Nothing matches &quot;{filter}&quot;
              </span>
            ) : null}
          </>
        )}
      </div>
    </TileSettingsContent>
  );
};

function PlotTopicGroup({
  seriesConfigs,
  toggleSeries,
  topic,
}: {
  readonly seriesConfigs: readonly McapPlotSeriesConfig[];
  readonly toggleSeries: (
    topic: string,
    fieldPath: string,
    enabled: boolean,
  ) => void;
  readonly topic: McapTopicNumericFields;
}) {
  const enabledByPath = useMemo(() => {
    const byPath = new Map<string, McapPlotSeriesConfig>();
    for (const config of seriesConfigs) {
      if (config.topic === topic.topic) {
        byPath.set(config.fieldPath, config);
      }
    }
    return byPath;
  }, [seriesConfigs, topic.topic]);

  if (topic.encoding === "unsupported") {
    return (
      <McapSidebarGroup
        defaultExpanded={false}
        summary="not supported"
        title={topic.topic}
      >
        <span className={settingsStyles.emptyText}>
          This topic&apos;s message encoding is not plottable yet
        </span>
      </McapSidebarGroup>
    );
  }

  if (topic.fields.length === 0) {
    return null;
  }

  return (
    <McapSidebarGroup
      defaultExpanded={enabledByPath.size > 0}
      summary={
        `${enabledByPath.size} of ${topic.fields.length} plotted` +
        (topic.sampled ? " · sampled" : "")
      }
      title={topic.topic}
    >
      <div className={settingsStyles.optionStack}>
        {topic.fields.map((field) => {
          const enabled = enabledByPath.get(field.path);
          return (
            <div
              className={McapPlotTileStyles.fieldRow}
              key={field.path}
              title={`${field.path} (${field.valueType})`}
            >
              <Checkbox
                checked={enabled !== undefined}
                label={field.path}
                onChange={(checked) =>
                  toggleSeries(topic.topic, field.path, checked)
                }
                {...checkboxNoSpaceToggleProps}
              />
              {enabled ? (
                <span
                  aria-hidden="true"
                  className={McapPlotTileStyles.swatch}
                  style={{ backgroundColor: enabled.color }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </McapSidebarGroup>
  );
}

/**
 * Case-insensitive filter over topics and field paths: a matching topic
 * keeps all its fields, otherwise only matching fields survive.
 */
function filterTopics(
  topics: readonly McapTopicNumericFields[],
  filter: string,
): readonly McapTopicNumericFields[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) {
    return topics;
  }

  const matches: McapTopicNumericFields[] = [];
  for (const topic of topics) {
    if (topic.topic.toLowerCase().includes(needle)) {
      matches.push(topic);
      continue;
    }
    const fields = topic.fields.filter((field) =>
      field.path.toLowerCase().includes(needle),
    );
    if (fields.length > 0) {
      matches.push({ ...topic, fields });
    }
  }

  return matches;
}

export default McapPlotTileSettings;
