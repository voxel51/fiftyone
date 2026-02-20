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

function formatQuery(run: SimilarityRun): string {
  if (run.query_type === "text" && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === "image") {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    const negCount = run.negative_query_ids?.length ?? 0;
    let label = `Image similarity (${count} ${
      count === 1 ? "sample" : "samples"
    })`;
    if (negCount > 0) {
      label += ` \u00B7 ${negCount} negative`;
    }
    return label;
  }
  return run.query_type;
}

function formatTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

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
    <div
      style={{
        display: "flex",
        overflowX: "auto",
        gap: "0.25rem",
        paddingBottom: "0.25rem",
      }}
    >
      {ids.map((id) => {
        const filepath = sampleMedia[id];
        if (!filepath) {
          return (
            <div
              key={id}
              style={{
                width: "3rem",
                height: "3rem",
                minWidth: "3rem",
                borderRadius: "0.25rem",
                background: "var(--fo-palette-background-level2)",
              }}
            />
          );
        }
        return (
          <img
            key={id}
            src={getSampleSrc(filepath)}
            style={{
              width: 48,
              height: 48,
              minWidth: 48,
              borderRadius: 4,
              objectFit: "cover",
            }}
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
    <div
      style={{
        padding: "1rem",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        <div style={{ marginBottom: "0.5rem" }}>
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: "1rem",
          }}
        >
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: "0.5rem",
          }}
        >
          <Text color={TextColor.Secondary}>No runs match your filters</Text>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {filteredRuns.map((run) => {
            const isImage = run.query_type === "image";
            const isExpanded = expandedRunIds.has(run.run_id);
            const positiveIds = Array.isArray(run.query) ? run.query : [];
            const negativeIds = run.negative_query_ids ?? [];
            const isSelected = selectedRunIds.has(run.run_id);

            return (
              <div
                key={run.run_id}
                style={{
                  border:
                    appliedRunId === run.run_id
                      ? "1px solid var(--fo-palette-text-secondary)"
                      : "1px solid var(--fo-palette-text-secondary)",
                  borderRadius: "0.375rem",
                  padding: "0.75rem",
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginRight: "0.5rem",
                        paddingTop: "0.125rem",
                      }}
                    >
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
                      <div style={{ display: "flex", gap: 0 }}>
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
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                          }}
                        >
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
                    style={{
                      marginTop: "0.75rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid var(--fo-palette-divider)",
                    }}
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
