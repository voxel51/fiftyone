import { Checkbox } from "@voxel51/voodo";
import React, { useMemo, useState } from "react";
import type { NumericStreamFields } from "../../../ir";
import { useNumericSeriesContext } from "./numeric-series-context";
import {
  type PlotSeriesConfig,
  usePlotTileSeries,
  useTogglePlotSeries,
} from "./plot-tile-state";
import { checkboxNoSpaceToggleProps } from "../settings/controls/settings-keyboard";
import { matchesStreamFilter } from "../stream-discovery/stream-filter";
import PlotTileStyles from "./PlotTile.module.css";
import { SettingsFilterInput } from "../settings/controls/SettingsFilterInput";
import SidebarGroup from "../settings/controls/SidebarGroup";
import settingsStyles from "../tiles/Tile.settings.module.css";

/**
 * Settings sidebar for the plot tile: every stream with numeric leaf
 * fields, one checkbox per field, enabled series carrying their color
 * swatch. Streams without plottable fields are listed disabled with an
 * availability reason — a legible gap beats silent absence. Registered
 * into the sidebar's tile-settings registry, so it renders while this
 * tile is focused.
 */
const PlotTileSettings: React.FC = () => {
  const { enumeration } = useNumericSeriesContext();
  const seriesConfigs = usePlotTileSeries();
  const toggleSeries = useTogglePlotSeries();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () => filterStreams(enumeration.streams, filter),
    [enumeration.streams, filter],
  );

  return (
    <div className={settingsStyles.root}>
      {enumeration.status === "loading" || enumeration.status === "idle" ? (
        <span className={settingsStyles.emptyText}>Scanning streams…</span>
      ) : enumeration.status === "error" ? (
        <span className={settingsStyles.emptyText}>
          Could not scan this recording&apos;s streams
        </span>
      ) : enumeration.streams.length === 0 ? (
        <span className={settingsStyles.emptyText}>
          No plottable streams in this recording
        </span>
      ) : (
        <>
          <SettingsFilterInput
            onChange={setFilter}
            placeholder="Filter streams and fields"
            value={filter}
          />
          {filtered.map((stream) => (
            <PlotStreamGroup
              key={stream.streamId}
              seriesConfigs={seriesConfigs}
              toggleSeries={toggleSeries}
              stream={stream}
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
  );
};

function PlotStreamGroup({
  seriesConfigs,
  toggleSeries,
  stream,
}: {
  readonly seriesConfigs: readonly PlotSeriesConfig[];
  readonly toggleSeries: (
    stream: string,
    fieldPath: string,
    enabled: boolean,
  ) => void;
  readonly stream: NumericStreamFields;
}) {
  const enabledByPath = useMemo(() => {
    const byPath = new Map<string, PlotSeriesConfig>();
    for (const config of seriesConfigs) {
      if (config.stream === stream.streamId) {
        byPath.set(config.fieldPath, config);
      }
    }
    return byPath;
  }, [seriesConfigs, stream.streamId]);

  if (stream.availability !== "ready") {
    const copy = unavailableStreamCopy(stream.availability);
    return (
      <SidebarGroup
        defaultExpanded={false}
        summary={copy.summary}
        title={stream.sourceName}
      >
        <span className={settingsStyles.emptyText}>{copy.message}</span>
      </SidebarGroup>
    );
  }

  if (stream.fields.length === 0) {
    const copy = unavailableStreamCopy("no-numeric-fields");
    return (
      <SidebarGroup
        defaultExpanded={false}
        summary={copy.summary}
        title={stream.sourceName}
      >
        <span className={settingsStyles.emptyText}>{copy.message}</span>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup
      defaultExpanded={enabledByPath.size > 0}
      summary={
        `${enabledByPath.size} of ${stream.fields.length} plotted` +
        (stream.sampled ? " · sampled" : "")
      }
      title={stream.sourceName}
    >
      <div className={settingsStyles.optionStack}>
        {stream.fields.map((field) => {
          const enabled = enabledByPath.get(field.path);
          return (
            <div
              className={settingsStyles.fieldRow}
              key={field.path}
              title={`${field.path} (${field.valueType})`}
            >
              <Checkbox
                checked={enabled !== undefined}
                label={field.path}
                onChange={(checked) =>
                  toggleSeries(stream.streamId, field.path, checked)
                }
                {...checkboxNoSpaceToggleProps}
              />
              {enabled ? (
                <span
                  aria-hidden="true"
                  className={PlotTileStyles.swatch}
                  style={{ backgroundColor: enabled.color }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </SidebarGroup>
  );
}

function unavailableStreamCopy(
  availability: Exclude<NumericStreamFields["availability"], "ready">,
): { readonly message: string; readonly summary: string } {
  switch (availability) {
    case "schema-unavailable":
      return {
        message:
          "This stream's schema could not be read, so numeric fields cannot be listed",
        summary: "schema unavailable",
      };
    case "unsupported-encoding":
      return {
        message: "This stream's message encoding is not plottable yet",
        summary: "encoding unsupported",
      };
    case "no-numeric-fields":
      return {
        message:
          "This stream decodes, but its schema has no scalar numeric fields to plot",
        summary: "no numeric fields",
      };
  }
}

/**
 * Case-insensitive filter over streams and field paths: a matching stream
 * keeps all its fields, otherwise only matching fields survive.
 */
function filterStreams(
  streams: readonly NumericStreamFields[],
  filter: string,
): readonly NumericStreamFields[] {
  if (!filter.trim()) {
    return streams;
  }

  const matches: NumericStreamFields[] = [];
  for (const stream of streams) {
    if (matchesStreamFilter(filter, stream.sourceName)) {
      matches.push(stream);
      continue;
    }
    const fields = stream.fields.filter((field) =>
      matchesStreamFilter(filter, field.path),
    );
    if (fields.length > 0) {
      matches.push({ ...stream, fields });
    }
  }

  return matches;
}

export default PlotTileSettings;
