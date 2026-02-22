import Add from "@mui/icons-material/Add";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import EditNote from "@mui/icons-material/EditNote";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import GridView from "@mui/icons-material/GridView";
import ImageSearch from "@mui/icons-material/ImageSearch";
import OpenInNew from "@mui/icons-material/OpenInNew";
import Refresh from "@mui/icons-material/Refresh";
import ImageList from "@mui/material/ImageList";
import ImageListItem from "@mui/material/ImageListItem";
import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
import { scrollable } from "@fiftyone/components";
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
import { BrainKeyConfig, SimilarityRun, RunFilterState } from "../types";
import { formatQuery, formatTime } from "../utils";
import StatusBadge from "./StatusBadge";
import FilterBar from "./FilterBar";
import BulkActionBar from "./BulkActionBar";
import * as s from "./styles";

const BRAIN_COMPUTE_SIMILARITY_URI = "@voxel51/brain/compute_similarity";
const BRAIN_PLUGIN_URL =
  "https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/brain";
const DOCS_URL = "https://docs.voxel51.com/brain.html#similarity";

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

const THUMB_SIZE = 36;
const THUMB_GAP = 4;
const THUMB_SINGLE_ROW_MAX = 10;

function SampleThumbnails({
  ids,
  sampleMedia,
}: {
  ids: string[];
  sampleMedia: Record<string, string>;
}) {
  if (!ids.length) return null;

  const useOneRow = ids.length <= THUMB_SINGLE_ROW_MAX;
  const cols = useOneRow ? ids.length : Math.ceil(ids.length / 2);
  const rows = useOneRow ? 1 : 2;

  return (
    <ImageList
      cols={cols}
      rowHeight={THUMB_SIZE}
      gap={THUMB_GAP}
      sx={{
        gridTemplateColumns: `repeat(${cols}, ${THUMB_SIZE}px) !important`,
        overflowX: "auto",
        overflowY: "hidden",
        maxHeight: THUMB_SIZE * rows + THUMB_GAP * (rows - 1),
        m: 0,
      }}
    >
      {ids.map((id) => {
        const filepath = sampleMedia[id];
        return (
          <ImageListItem key={id}>
            {filepath ? (
              <img src={getSampleSrc(filepath)} alt="" style={s.thumbnail} />
            ) : (
              <div style={s.thumbnailPlaceholder} />
            )}
          </ImageListItem>
        );
      })}
    </ImageList>
  );
}

/**
 * Isolated component so `usePromptOperatorInput` is only called when the
 * operator actually exists (hooks can't be conditional).
 */
function ComputeSimilarityButton() {
  const promptForInput = usePromptOperatorInput();
  return (
    <Button
      variant={Variant.Primary}
      size={Size.Sm}
      onClick={() => promptForInput(BRAIN_COMPUTE_SIMILARITY_URI)}
    >
      Compute Similarity Index
    </Button>
  );
}

function NoBrainKeysEmptyState() {
  const { exists: hasBrainOperator } = useFirstExistingUri([
    BRAIN_COMPUTE_SIMILARITY_URI,
  ]);

  return (
    <div style={s.noBrainKeysContainer}>
      <div style={s.noBrainKeysCard}>
        {/* Header section */}
        <div style={s.noBrainKeysHeader}>
          <div style={s.noBrainKeysIconBox}>
            <ImageSearch
              style={{
                fontSize: 24,
                color: "var(--fo-palette-primary-main)",
              }}
            />
          </div>
          <div style={s.noBrainKeysHeaderText}>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Primary}
              style={{ fontWeight: 600 }}
            >
              No similarity index found
            </Text>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {hasBrainOperator
                ? "Create an index to search for similar samples by image or text."
                : "Install the Brain plugin or compute the similarity index via Python SDK."}
            </Text>
          </div>
        </div>

        {/* Divider */}
        <div style={s.divider} />

        {hasBrainOperator ? (
          <>
            {/* Primary CTA */}
            <div style={s.noBrainKeysCta}>
              <ComputeSimilarityButton />
              <Text variant={TextVariant.Sm} color={TextColor.Muted}>
                or create an index via{" "}
                <span
                  style={{ textDecoration: "underline", cursor: "pointer" }}
                  onClick={() => window.open(DOCS_URL, "_blank")}
                >
                  Python SDK
                </span>
              </Text>
            </div>
          </>
        ) : (
          <>
            {/* Install plugin instructions */}
            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Install via CLI:
              </Text>
              <pre className={scrollable} style={s.codeBlock}>
                {`fiftyone plugins download \\
    https://github.com/voxel51/fiftyone-plugins \\
    --plugin-names @voxel51/brain`}
              </pre>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Muted}
                style={{ marginTop: 10 }}
              >
                Enterprise: ask your admin to install via Settings &gt; Plugins.
              </Text>
            </div>

            {/* Divider */}
            <div style={s.divider} />

            {/* Python SDK fallback */}
            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Muted}
                style={{ marginBottom: 6 }}
              >
                Or create an index via Python:
              </Text>
              <pre className={scrollable} style={s.codeBlock}>
                {`import fiftyone.brain as fob

results = fob.compute_similarity(
    dataset,
    model="clip-vit-base32-torch",
    brain_key="clip_sim",
)`}
              </pre>
            </div>

            {/* Divider */}
            <div style={s.divider} />

            {/* Actions */}
            <div style={s.noBrainKeysActions}>
              <Button
                variant={Variant.Secondary}
                size={Size.Sm}
                onClick={() => window.open(DOCS_URL, "_blank")}
                trailingIcon={() => <OpenInNew style={{ fontSize: 14 }} />}
              >
                View Docs
              </Button>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                onClick={() => window.open(BRAIN_PLUGIN_URL, "_blank")}
                trailingIcon={() => <OpenInNew style={{ fontSize: 14 }} />}
              >
                Brain Plugin
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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

      // Fetch sample media when expanding (side effect outside setState)
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
        <Heading level="h2">Similarity Search</Heading>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
          {runs.length > 0 && (
            <Tooltip content="Refresh">
              <Button
                size={Size.Sm}
                variant={Variant.Borderless}
                leadingIcon={RefreshIcon}
                onClick={onRefresh}
              />
            </Tooltip>
          )}
          {runs.length > 0 && (
            <Button
              variant={selectMode ? Variant.Secondary : Variant.Borderless}
              size={Size.Sm}
              leadingIcon={ManageIcon}
              onClick={onToggleSelectMode}
            >
              {selectMode ? "Done" : "Manage"}
            </Button>
          )}
          <Tooltip
            content={
              brainKeys.length === 0
                ? "No similarity index computed"
                : "Start a new search"
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

      {/* Filter bar — hidden when there are no brain keys / runs */}
      {brainKeys.length > 0 && (
        <FilterBar
          filterState={filterState}
          onChange={onFilterChange}
          resultCount={filteredRuns.length}
          totalCount={runs.length}
        />
      )}

      {/* Select All row */}
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

      {/* Content area */}
      {brainKeys.length === 0 ? (
        <NoBrainKeysEmptyState />
      ) : runs.length === 0 ? (
        <div style={s.emptyState}>
          <Text color={TextColor.Secondary}>No similarity searches yet</Text>
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Click "New Search" to find similar samples using your computed
            embeddings.
          </Text>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div style={s.emptyState}>
          <Text color={TextColor.Secondary}>No runs match your filters</Text>
        </div>
      ) : (
        <div style={s.runsList}>
          {filteredRuns.map((run) => {
            const isImage = run.query_type === "image";
            const isExpanded = expandedRunIds.has(run.run_id);
            const positiveIds = Array.isArray(run.query) ? run.query : [];
            const negativeIds = run.negative_query_ids ?? [];
            const isSelected = selectedRunIds.has(run.run_id);

            return (
              <div key={run.run_id} style={s.runCard}>
                <Stack
                  orientation={Orientation.Row}
                  style={{
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  {/* Checkbox in select mode */}
                  {selectMode && (
                    <div style={s.checkboxCell}>
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
                      <div style={s.actionButtons}>
                        <Tooltip content="Apply results">
                          <Button
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={ApplyIcon}
                            onClick={() => onApply(run.run_id)}
                            disabled={run.status !== "completed"}
                          />
                        </Tooltip>
                        <Tooltip content="Clone search">
                          <Button
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={CloneIcon}
                            onClick={() => onClone(run.run_id)}
                          />
                        </Tooltip>
                        <Tooltip content="Delete">
                          <Button
                            size={Size.Sm}
                            variant={Variant.Borderless}
                            leadingIcon={DeleteIcon}
                            onClick={() => onDelete(run.run_id)}
                          />
                        </Tooltip>
                      </div>
                      {isImage && (
                        <div style={s.expandButton}>
                          <Tooltip
                            content={isExpanded ? "Collapse" : "Show samples"}
                          >
                            <Button
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
                  <div style={s.expandedSection}>
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
