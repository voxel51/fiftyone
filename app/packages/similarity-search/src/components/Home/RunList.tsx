import {
  Align,
  Button,
  Checkbox,
  Heading,
  HeadingLevel,
  Icon,
  IconName,
  Justify,
  RichList,
  Size,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Orientation,
  Spacing,
  Variant,
} from "@voxel51/voodo";
import { FileUploadOutlined } from "../../mui";
import { useCallback, useMemo, useState } from "react";
import {
  BrainKeyConfig,
  QueryType,
  SimilarityRun,
  RunFilterState,
} from "../../types";
import { useSampleMedia } from "../../hooks/useSampleMedia";
import { MIDDLE_DOT } from "../../constants";
import { formatQuery, formatTime } from "../../utils";
import StatusBadge from "./StatusBadge";
import RunActions from "./RunActions";
import ExpandedThumbnails from "./ExpandedThumbnails";
import FilterBar from "./FilterBar";
import BulkActionBar from "./BulkActionBar";
import { SelectAllRow, tooltipTextStyle } from "../styled";

function QueryTypeIcon({ queryType }: { queryType: string }) {
  if (queryType === QueryType.Upload) {
    return <FileUploadOutlined sx={{ fontSize: 18 }} />;
  }
  return (
    <Icon
      name={
        queryType === QueryType.Text ? IconName.Search : IconName.ImageSearch
      }
      size={Size.Xl}
      color={TextColor.Primary}
    />
  );
}

const MAX_RUN_NAME_LENGTH = 40;

function RunName({ name }: { name: string }) {
  const isTruncated = name.length > MAX_RUN_NAME_LENGTH;
  const displayName = isTruncated
    ? name.slice(0, MAX_RUN_NAME_LENGTH) + "..."
    : name;

  const content = (
    <Text
      variant={TextVariant.Md}
      style={{ fontWeight: "bold", whiteSpace: "nowrap" }}
    >
      {displayName}
    </Text>
  );

  if (isTruncated) {
    return <Tooltip content={name}>{content}</Tooltip>;
  }

  return content;
}

type SelectionState = {
  selectMode: boolean;
  selectedRunIds: Set<string>;
  onToggleSelectMode: () => void;
  onToggleRunSelection: (runId: string) => void;
  onSelectAll: (visibleRunIds: string[]) => void;
  onDeselectAll: () => void;
  onClearAndExit: () => void;
};

type RunListProps = {
  runs: SimilarityRun[];
  filteredRuns: SimilarityRun[];
  brainKeys: BrainKeyConfig[];
  appliedRunId?: string;
  sampleMedia: Record<string, string>;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onBulkDelete: (runIds: string[]) => void;
  onRefresh: () => void;
  onNewSearch: () => void;
  onSettings: () => void;
  onGetSampleMedia: (payload: { sample_ids: string[] }) => void;
  filterState: RunFilterState;
  onFilterChange: (state: RunFilterState) => void;
  canFilterByOwner: boolean;
  selection: SelectionState;
};

const tip = (text: string) => <span style={tooltipTextStyle}>{text}</span>;

export default function RunList({
  runs,
  filteredRuns,
  brainKeys,
  appliedRunId,
  sampleMedia,
  onApply,
  onClone,
  onDelete,
  onBulkDelete,
  onRefresh,
  onNewSearch,
  onSettings,
  onGetSampleMedia,
  filterState,
  onFilterChange,
  canFilterByOwner,
  selection,
}: RunListProps) {
  const {
    selectMode,
    selectedRunIds,
    onToggleSelectMode,
    onSelectAll,
    onDeselectAll,
    onClearAndExit,
  } = selection;

  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());

  const { mergedMedia, handleToggleExpand: onMediaToggle } = useSampleMedia({
    sampleMedia,
    expandedRunIds,
    filteredRuns,
    onGetSampleMedia,
  });

  const handleToggleExpand = useCallback(
    (run: SimilarityRun) => {
      onMediaToggle(run);
      setExpandedRunIds((prev) => {
        const next = new Set(prev);
        if (next.has(run.run_id)) {
          next.delete(run.run_id);
        } else {
          next.add(run.run_id);
        }
        return next;
      });
    },
    [onMediaToggle]
  );

  const visibleRunIds = useMemo(
    () => filteredRuns.map((r) => r.run_id),
    [filteredRuns]
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleRunIds.length > 0 &&
      visibleRunIds.every((id) => selectedRunIds.has(id)),
    [visibleRunIds, selectedRunIds]
  );

  const handleSelectAllToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        onSelectAll(visibleRunIds);
      } else {
        onDeselectAll();
      }
    },
    [visibleRunIds, onSelectAll, onDeselectAll]
  );

  const handleBulkDelete = useCallback(() => {
    onBulkDelete(Array.from(selectedRunIds));
  }, [onBulkDelete, selectedRunIds]);

  const listItems = useMemo(
    () =>
      filteredRuns.map((run) => ({
        id: run.run_id,
        data: {
          canSelect: selectMode,
          onClick:
            !selectMode && run.status === "completed"
              ? () => onApply(run.run_id)
              : undefined,
          style:
            !selectMode && run.status === "completed"
              ? { cursor: "pointer" }
              : undefined,
          primaryContent: (
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Sm}
                align={Align.Center}
              >
                <QueryTypeIcon queryType={run.query_type} />
                <RunName name={run.run_name} />
                <StatusBadge status={run.status} />
                {run.status === "completed" && (
                  <Text variant={TextVariant.Md} color={TextColor.Muted}>
                    {run.result_count} results
                  </Text>
                )}
              </Stack>
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                {formatQuery(run)} {MIDDLE_DOT} {run.brain_key}
                {run.k ? ` ${MIDDLE_DOT} k=${run.k}` : ""}
                {run.reverse ? " (least similar)" : ""}
              </Text>
              <Text variant={TextVariant.Md} color={TextColor.Muted}>
                {formatTime(run.creation_time)}
                {run.created_by ? ` by ${run.created_by}` : ""}
              </Text>
              {run.status === "failed" && run.status_details && (
                <Text variant={TextVariant.Md} color={TextColor.Destructive}>
                  {run.status_details}
                </Text>
              )}
            </Stack>
          ),
          actions: selectMode ? undefined : (
            <RunActions
              run={run}
              isExpanded={expandedRunIds.has(run.run_id)}
              onApply={onApply}
              onClone={onClone}
              onDelete={onDelete}
              onToggleExpand={handleToggleExpand}
            />
          ),
          additionalContent:
            run.query_type === "image" &&
            expandedRunIds.has(run.run_id) &&
            !selectMode ? (
              <ExpandedThumbnails run={run} sampleMedia={mergedMedia} />
            ) : undefined,
        },
      })),
    [
      filteredRuns,
      selectMode,
      expandedRunIds,
      mergedMedia,
      onApply,
      onClone,
      onDelete,
      handleToggleExpand,
    ]
  );

  return (
    <Stack
      orientation={Orientation.Column}
      style={{ padding: 16, height: "100%" }}
    >
      {/* Header */}
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        justify={Justify.Between}
        style={{ marginBottom: "1rem" }}
      >
        <Heading level={HeadingLevel.H2}>
          {runs.length > 0
            ? `${runs.length} Similarity ${
                runs.length === 1 ? "Search" : "Searches"
              }`
            : "Similarity Search"}
        </Heading>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          {runs.length > 0 && (
            <Tooltip content={tip("Refresh")}>
              <Button
                size={Size.Md}
                variant={Variant.Borderless}
                leadingIcon={IconName.Refresh}
                onClick={onRefresh}
              />
            </Tooltip>
          )}
          {runs.length > 0 && (
            <Tooltip content={tip("Manage searches")}>
              <Button
                variant={selectMode ? Variant.Secondary : Variant.Borderless}
                size={Size.Md}
                leadingIcon={IconName.Notes}
                onClick={onToggleSelectMode}
              />
            </Tooltip>
          )}
          <Tooltip content={tip("Similarity indexes")}>
            <Button
              size={Size.Md}
              variant={Variant.Borderless}
              leadingIcon={IconName.Settings}
              onClick={onSettings}
            />
          </Tooltip>
          <Tooltip
            content={
              brainKeys.length === 0
                ? tip("No similarity index computed")
                : tip("Start a new search")
            }
          >
            <span>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                leadingIcon={IconName.Add}
                onClick={onNewSearch}
                disabled={brainKeys.length === 0}
              >
                New Search
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Filter bar */}
      {brainKeys.length > 0 && (
        <FilterBar
          filterState={filterState}
          onChange={onFilterChange}
          resultCount={filteredRuns.length}
          totalCount={runs.length}
          canFilterByOwner={canFilterByOwner}
        />
      )}

      {/* Content area */}
      {runs.length === 0 ? (
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          justify={Justify.Center}
          spacing={Spacing.Sm}
          style={{ flex: 1 }}
        >
          <Text color={TextColor.Secondary}>No similarity searches yet</Text>
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            Click "New Search" to find similar samples using your computed
            embeddings.
          </Text>
        </Stack>
      ) : filteredRuns.length === 0 ? (
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          justify={Justify.Center}
          spacing={Spacing.Sm}
          style={{ flex: 1 }}
        >
          <Text color={TextColor.Secondary}>
            No searches match your filters
          </Text>
        </Stack>
      ) : (
        <>
          {selectMode && filteredRuns.length > 0 && (
            <SelectAllRow>
              <Checkbox
                label={allVisibleSelected ? "Deselect all" : "Select all"}
                checked={allVisibleSelected}
                onChange={handleSelectAllToggle}
                size={Size.Sm}
              />
            </SelectAllRow>
          )}
          <RichList
            className="similarity-run-list"
            listItems={listItems}
            selected={Array.from(selectedRunIds)}
            onSelected={onSelectAll}
          />
        </>
      )}

      {/* Bulk action bar */}
      {selectMode && (
        <BulkActionBar
          selectedCount={selectedRunIds.size}
          onDelete={handleBulkDelete}
          onCancel={onClearAndExit}
        />
      )}
    </Stack>
  );
}
