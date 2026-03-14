import {
  AddIcon as Add,
  EditNoteIcon as EditNote,
  RefreshIcon as Refresh,
  SettingsIcon as Settings,
} from "../../mui";
import {
  Button,
  Checkbox,
  Heading,
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BrainKeyConfig, SimilarityRun, RunFilterState } from "../../types";
import { formatQuery, formatTime } from "../../utils";
import StatusBadge from "./StatusBadge";
import RunActions from "./RunActions";
import ExpandedThumbnails from "./ExpandedThumbnails";
import NoBrainKeysEmptyState from "./NoBrainKeysEmptyState";
import FilterBar from "./FilterBar";
import BulkActionBar from "./BulkActionBar";
import * as s from "../styles";

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
  selectMode: boolean;
  selectedRunIds: Set<string>;
  onToggleSelectMode: () => void;
  onToggleRunSelection: (runId: string) => void;
  onSelectAll: (visibleRunIds: string[]) => void;
  onDeselectAll: () => void;
  onClearAndExit: () => void;
};

const RefreshIcon = () => <Refresh fontSize="small" />;
const AddIcon = () => <Add fontSize="small" />;
const ManageIcon = () => <EditNote fontSize="small" />;
const SettingsIconBtn = () => <Settings fontSize="small" />;

const tip = (text: string) => <span style={s.tooltipText}>{text}</span>;

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
  selectMode,
  selectedRunIds,
  onToggleSelectMode,
  onToggleRunSelection,
  onSelectAll,
  onDeselectAll,
  onClearAndExit,
}: RunListProps) {
  const [expandedRunIds, setExpandedRunIds] = useState<Set<string>>(new Set());

  const accumulatedMedia = useRef<Record<string, string>>({});
  useEffect(() => {
    if (sampleMedia && Object.keys(sampleMedia).length > 0) {
      accumulatedMedia.current = {
        ...accumulatedMedia.current,
        ...sampleMedia,
      };
    }
  }, [sampleMedia]);
  const mergedMedia = { ...accumulatedMedia.current, ...sampleMedia };

  const handleToggleExpand = useCallback(
    (run: SimilarityRun) => {
      const wasExpanded = expandedRunIds.has(run.run_id);

      setExpandedRunIds((prev) => {
        const next = new Set(prev);
        if (next.has(run.run_id)) {
          next.delete(run.run_id);
        } else {
          next.add(run.run_id);
        }
        return next;
      });

      if (!wasExpanded) {
        const positiveIds = Array.isArray(run.query) ? run.query : [];
        const negativeIds = run.negative_query_ids ?? [];
        const allIds = [...positiveIds, ...negativeIds];
        if (allIds.length > 0) {
          onGetSampleMedia({ sample_ids: allIds });
        }
      }
    },
    [expandedRunIds, onGetSampleMedia]
  );

  const handleSelected = useCallback(
    (selectedIds: string[]) => {
      const currentIds = new Set(selectedIds);
      for (const id of selectedIds) {
        if (!selectedRunIds.has(id)) onToggleRunSelection(id);
      }
      for (const id of selectedRunIds) {
        if (!currentIds.has(id)) onToggleRunSelection(id);
      }
    },
    [selectedRunIds, onToggleRunSelection]
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
          primaryContent: (
            <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Sm}
                style={{ alignItems: "center" }}
              >
                <span style={{ fontWeight: "bold" }}>{run.run_name}</span>
                <StatusBadge status={run.status} />
                {run.status === "completed" && (
                  <Text variant={TextVariant.Md} color={TextColor.Muted}>
                    {run.result_count} results
                  </Text>
                )}
              </Stack>
              <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                {formatQuery(run)} {"\u00B7"} {run.brain_key}
                {run.k ? ` \u00B7 k=${run.k}` : ""}
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
    <div style={s.runListContainer}>
      {/* Header */}
      <Stack
        orientation={Orientation.Row}
        style={{
          marginBottom: "1rem",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Heading level="h2">
          {runs.length} Similarity {runs.length === 1 ? "Search" : "Searches"}
        </Heading>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          {runs.length > 0 && (
            <Tooltip content={tip("Refresh")}>
              <Button
                size={Size.Sm}
                variant={Variant.Borderless}
                leadingIcon={RefreshIcon}
                onClick={onRefresh}
              />
            </Tooltip>
          )}
          {runs.length > 0 && (
            <Tooltip content={tip("Manage searches")}>
              <Button
                variant={selectMode ? Variant.Secondary : Variant.Borderless}
                size={Size.Sm}
                leadingIcon={ManageIcon}
                onClick={onToggleSelectMode}
              />
            </Tooltip>
          )}
          <Tooltip content={tip("Similarity indexes")}>
            <Button
              size={Size.Sm}
              variant={Variant.Borderless}
              leadingIcon={SettingsIconBtn}
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
                leadingIcon={AddIcon}
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
        />
      )}

      {/* Content area */}
      {brainKeys.length === 0 ? (
        <NoBrainKeysEmptyState />
      ) : runs.length === 0 ? (
        <div style={s.emptyState}>
          <Text color={TextColor.Secondary}>No similarity searches yet</Text>
          <Text variant={TextVariant.Md} color={TextColor.Secondary}>
            Click "New Search" to find similar samples using your computed
            embeddings.
          </Text>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div style={s.emptyState}>
          <Text color={TextColor.Secondary}>
            No searches match your filters
          </Text>
        </div>
      ) : (
        <>
          {selectMode && filteredRuns.length > 0 && (
            <div style={s.selectAllRow}>
              <Checkbox
                label={allVisibleSelected ? "Deselect all" : "Select all"}
                checked={allVisibleSelected}
                onChange={handleSelectAllToggle}
                size={Size.Sm}
              />
            </div>
          )}
          <style>{`
            .similarity-run-list > div {
              cursor: pointer;
            }
            .similarity-run-list .justify-between {
              align-items: flex-start !important;
            }
          `}</style>
          <RichList
            className="similarity-run-list"
            listItems={listItems}
            selected={Array.from(selectedRunIds)}
            onSelected={handleSelected}
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
    </div>
  );
}
