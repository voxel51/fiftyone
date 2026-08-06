import React, { useEffect, useMemo, useState } from "react";
import {
  useRawMessageContext,
  type RawStreamInfo,
} from "./raw-message-context";
import {
  useRawTileStream,
  useSetRawTileStream,
} from "../tiles/raw-message-binding";
import { settingsBooleanNoSpaceToggleProps } from "../settings/controls/settings-keyboard";
import { matchesStreamFilter } from "../stream-discovery/stream-filter";
import { SettingsFilterInput } from "../settings/controls/SettingsFilterInput";
import rawStyles from "../../../visualization/message/StructuredMessage.module.css";
import settingsStyles from "../tiles/Tile.settings.module.css";

/**
 * Settings sidebar for the raw message tile: every stream in the
 * recording — including streams no visualization can render, which is
 * the tile's reason to exist — with a filter box and single-select
 * radio rows (one inspected stream at a time). Registered into the
 * sidebar's tile-settings registry, so it renders while this tile is
 * focused.
 */
const RawMessageTileSettings: React.FC = () => {
  const { ensureStreams, streams } = useRawMessageContext();
  const selectedStream = useRawTileStream();
  const setStream = useSetRawTileStream();
  const [filter, setFilter] = useState("");

  // This effect kicks the stream inventory read the first time any raw
  // tile is focused.
  useEffect(() => {
    ensureStreams();
  }, [ensureStreams]);

  const sorted = useMemo(
    () =>
      [...streams.streams].sort((left, right) =>
        left.sourceName.localeCompare(right.sourceName),
      ),
    [streams.streams],
  );
  const filtered = useMemo(
    () => filterStreams(sorted, filter),
    [sorted, filter],
  );

  return (
    <div className={settingsStyles.root} data-cy="episode-raw-settings">
      {streams.status === "loading" || streams.status === "idle" ? (
        <span className={settingsStyles.emptyText}>Reading streams…</span>
      ) : streams.status === "error" ? (
        <span className={settingsStyles.emptyText}>
          Could not read this recording&apos;s streams
        </span>
      ) : sorted.length === 0 ? (
        <span className={settingsStyles.emptyText}>
          No streams in this recording
        </span>
      ) : (
        <>
          <SettingsFilterInput
            onChange={setFilter}
            placeholder="Filter streams"
            value={filter}
          />
          <div
            aria-label="Inspected stream"
            className={settingsStyles.optionStack}
            role="radiogroup"
          >
            {filtered.map((stream) => (
              <RawStreamRow
                key={stream.streamId}
                onSelect={setStream}
                selected={stream.streamId === selectedStream}
                stream={stream}
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
  );
};

/**
 * One selectable stream. A native radio input carries the single-select
 * semantics (previously a checkbox that silently behaved like a radio):
 * assistive tech announces one-of-many, arrow keys move the selection
 * within the group, and the modal's reserved-Space guard applies like
 * every other settings control.
 */
function RawStreamRow({
  onSelect,
  selected,
  stream,
}: {
  readonly onSelect: (stream: string | null) => void;
  readonly selected: boolean;
  readonly stream: RawStreamInfo;
}) {
  const caption = [
    stream.schemaName ?? "no schema",
    stream.encoding,
    stream.sampleCount !== null
      ? `${stream.sampleCount.toLocaleString()} msgs`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <label
      className={`${settingsStyles.fieldRow} ${settingsStyles.radioRow}`}
      data-cy={`episode-raw-stream-${stream.streamId}`}
      title={caption}
    >
      <input
        aria-label={stream.sourceName}
        checked={selected}
        name="episode-raw-stream"
        onChange={() => onSelect(stream.streamId)}
        type="radio"
        value={stream.streamId}
        {...settingsBooleanNoSpaceToggleProps}
      />
      <span className={settingsStyles.radioRowLabel}>{stream.sourceName}</span>
      <span className={rawStyles.truncatedText}>{stream.encoding}</span>
    </label>
  );
}

/**
 * Case-insensitive filter over stream names and schema names.
 */
function filterStreams(
  streams: readonly RawStreamInfo[],
  filter: string,
): readonly RawStreamInfo[] {
  if (!filter.trim()) {
    return streams;
  }

  return streams.filter((stream) =>
    matchesStreamFilter(filter, stream.sourceName, stream.schemaName),
  );
}

export default RawMessageTileSettings;
