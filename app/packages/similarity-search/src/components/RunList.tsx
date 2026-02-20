import Add from "@mui/icons-material/Add";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import EditNote from "@mui/icons-material/EditNote";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import GridView from "@mui/icons-material/GridView";
import Refresh from "@mui/icons-material/Refresh";
import { getSampleSrc } from "@fiftyone/state";
import {
  Button,
  Checkbox,
  Heading,
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
import { SimilarityRun, RunFilterState } from "../types";
import { formatQuery, formatTime } from "../utils";
import StatusBadge from "./StatusBadge";
import FilterBar from "./FilterBar";
import BulkActionBar from "./BulkActionBar";

type RunListProps = {
  runs: SimilarityRun[];
  filteredRuns: SimilarityRun[];
  appliedRunId?: string;
  sampleMedia: Record<string, string>;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onBulkDelete: (runIds: string[]) => void;
  onRefresh: () => void;
  onNewSearch: () => void;
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

const ApplyIcon = () => <GridView fontSize="small" />;
const CloneIcon = () => <ContentCopy fontSize="small" />;
const DeleteIcon = () => <Delete fontSize="small" />;
const RefreshIcon = () => <Refresh fontSize="small" />;
const AddIcon = () => <Add fontSize="small" />;
const ManageIcon = () => <EditNote fontSize="small" />;
const ExpandMoreIcon = () => (
  <ExpandMore
    fontSize="small"
    style={{ color: "var(--fo-palette-text-secondary)" }}
  />
);
const ExpandLessIcon = () => (
  <ExpandLess
    fontSize="small"
    style={{ color: "var(--fo-palette-text-secondary)" }}
  />
);

function SampleThumbnails({
  ids,
  sampleMedia,
}: {
  ids: string[];
  sampleMedia: Record<string, string>;
}) {
  if (!ids.length) return null;

  return (
    <div className="flex overflow-x-auto gap-1 pb-1">
      {ids.map((id) => {
        const filepath = sampleMedia[id];
        if (!filepath) {
          return (
            <div
              key={id}
              className="w-12 h-12 min-w-[3rem] rounded"
              style={{ background: "var(--fo-palette-background-level2)" }}
            />
          );
        }
        return (
          <img
            key={id}
            src={getSampleSrc(filepath)}
            className="w-12 h-12 min-w-[48px] rounded object-cover"
          />
        );
      })}
    </div>
  );
}

export default function RunList({
  runs,
  filteredRuns,
  appliedRunId,
  sampleMedia,
  onApply,
  onClone,
  onDelete,
  onBulkDelete,
  onRefresh,
  onNewSearch,
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

  // Accumulate sample media across multiple expand calls so previous
  // thumbnails aren't lost when a new card is expanded
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
      setExpandedRunIds((prev) => {
        const next = new Set(prev);
        if (next.has(run.run_id)) {
          next.delete(run.run_id);
          return next;
        }

        next.add(run.run_id);

        // Collect all sample IDs to fetch media for
        const positiveIds = Array.isArray(run.query) ? run.query : [];
        const negativeIds = run.negative_query_ids ?? [];
        const allIds = [...positiveIds, ...negativeIds];

        if (allIds.length > 0) {
          onGetSampleMedia({ sample_ids: allIds });
        }

        return next;
      });
    },
    [onGetSampleMedia]
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

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <Stack
        orientation={Orientation.Row}
        style={{
          marginBottom: "1rem",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Heading level="h2">Similarity Search</Heading>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          <Tooltip content="Refresh">
            <Button
              borderless
              size={Size.Sm}
              variant={Variant.Borderless}
              leadingIcon={RefreshIcon}
              onClick={onRefresh}
            />
          </Tooltip>
          <Button
            variant={selectMode ? Variant.Secondary : Variant.Borderless}
            size={Size.Sm}
            leadingIcon={ManageIcon}
            onClick={onToggleSelectMode}
          >
            {selectMode ? "Done" : "Manage"}
          </Button>
          <Button
            variant={Variant.Primary}
            size={Size.Sm}
            leadingIcon={AddIcon}
            onClick={onNewSearch}
          >
            New Search
          </Button>
        </Stack>
      </Stack>

      {/* Filter bar */}
      <FilterBar
        filterState={filterState}
        onChange={onFilterChange}
        resultCount={filteredRuns.length}
        totalCount={runs.length}
      />

      {/* Select All row */}
      {selectMode && filteredRuns.length > 0 && (
        <div className="mb-2">
          <Checkbox
            label={allVisibleSelected ? "Deselect all" : "Select all"}
            checked={allVisibleSelected}
            onChange={handleSelectAllToggle}
            size={Size.Sm}
          />
        </div>
      )}

      {/* Content area */}
      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Text color={TextColor.Secondary}>No similarity searches yet</Text>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Create a new search to find similar samples using your computed
            embeddings.
          </Text>
          <Button
            variant={Variant.Secondary}
            leadingIcon={AddIcon}
            onClick={onNewSearch}
          >
            New Search
          </Button>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2">
          <Text color={TextColor.Secondary}>No runs match your filters</Text>
        </div>
      ) : (
        <div className="flex-1 overflow-auto flex flex-col gap-2">
          {filteredRuns.map((run) => {
            const isImage = run.query_type === "image";
            const isExpanded = expandedRunIds.has(run.run_id);
            const positiveIds = Array.isArray(run.query) ? run.query : [];
            const negativeIds = run.negative_query_ids ?? [];
            const isSelected = selectedRunIds.has(run.run_id);

            return (
              <div
                key={run.run_id}
                className="rounded-md p-3"
                style={{
                  border: "1px solid var(--fo-palette-text-secondary)",
                  background: "var(--fo-palette-background-level1)",
                }}
              >
                <Stack
                  orientation={Orientation.Row}
                  style={{
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Checkbox in select mode */}
                  {selectMode && (
                    <div className="flex items-center mr-2 pt-0.5">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => onToggleRunSelection(run.run_id)}
                        size={Size.Sm}
                      />
                    </div>
                  )}

                  <Stack
                    orientation={Orientation.Column}
                    spacing={Spacing.Xs}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <Stack
                      orientation={Orientation.Row}
                      spacing={Spacing.Sm}
                      style={{ alignItems: "center" }}
                    >
                      <Text
                        variant={TextVariant.Md}
                        color={TextColor.Primary}
                        style={{ fontWeight: "bold" }}
                      >
                        {run.run_name}
                      </Text>
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
                    </Text>
                    {run.status === "failed" && run.status_details && (
                      <Text
                        variant={TextVariant.Md}
                        color={TextColor.Destructive}
                      >
                        {run.status_details}
                      </Text>
                    )}
                  </Stack>

                  {!selectMode && (
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Xs}
                      style={{ flexShrink: 0, alignItems: "flex-end" }}
                    >
                      <div className="flex">
                        <Tooltip content="Apply results">
                          <Button
                            borderless
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={ApplyIcon}
                            onClick={() => onApply(run.run_id)}
                            disabled={run.status !== "completed"}
                          />
                        </Tooltip>
                        <Tooltip content="Clone search">
                          <Button
                            borderless
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={CloneIcon}
                            onClick={() => onClone(run.run_id)}
                          />
                        </Tooltip>
                        <Tooltip content="Delete">
                          <Button
                            borderless
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={DeleteIcon}
                            onClick={() => onDelete(run.run_id)}
                          />
                        </Tooltip>
                      </div>
                      {isImage && (
                        <div className="flex justify-end">
                          <Tooltip
                            content={isExpanded ? "Collapse" : "Show samples"}
                          >
                            <Button
                              borderless
                              size={Size.Sm}
                              variant={Variant.Secondary}
                              leadingIcon={
                                isExpanded ? ExpandLessIcon : ExpandMoreIcon
                              }
                              onClick={() => handleToggleExpand(run)}
                            />
                          </Tooltip>
                        </div>
                      )}
                    </Stack>
                  )}
                </Stack>

                {isImage && isExpanded && !selectMode && (
                  <div
                    className="mt-3 pt-3"
                    style={{ borderTop: "1px solid var(--fo-palette-divider)" }}
                  >
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Sm}
                    >
                      {positiveIds.length > 0 && (
                        <div>
                          <Text
                            variant={TextVariant.Md}
                            color={TextColor.Success}
                            style={{ marginBottom: "0.375rem" }}
                          >
                            Positive ({positiveIds.length})
                          </Text>
                          <SampleThumbnails
                            ids={positiveIds}
                            sampleMedia={mergedMedia}
                          />
                        </div>
                      )}
                      {negativeIds.length > 0 && (
                        <div>
                          <Text
                            variant={TextVariant.Md}
                            color={TextColor.Destructive}
                            style={{ marginBottom: "0.375rem" }}
                          >
                            Negative ({negativeIds.length})
                          </Text>
                          <SampleThumbnails
                            ids={negativeIds}
                            sampleMedia={mergedMedia}
                          />
                        </div>
                      )}
                    </Stack>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
