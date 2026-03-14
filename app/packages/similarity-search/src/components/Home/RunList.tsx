import {
  AddIcon as Add,
  ContentCopyIcon as ContentCopy,
  DeleteIcon as Delete,
  EditNoteIcon as EditNote,
  ExpandLessIcon as ExpandLess,
  ExpandMoreIcon as ExpandMore,
  GridViewIcon as GridView,
  ImageSearchIcon as ImageSearch,
  OpenInNewIcon as OpenInNew,
  RefreshIcon as Refresh,
} from "../../mui";
import {
  usePromptOperatorInput,
  useFirstExistingUri,
} from "@fiftyone/operators";
import { scrollable } from "@fiftyone/components";
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
import {
  BRAIN_COMPUTE_SIMILARITY_URI,
  BRAIN_PLUGIN_URL,
  DOCS_URL,
} from "../../constants";
import { formatQuery, formatTime } from "../../utils";
import StatusBadge from "./StatusBadge";
import SampleThumbnails from "./SampleThumbnails";
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

const tip = (text: string) => <span style={s.tooltipText}>{text}</span>;

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
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              {hasBrainOperator
                ? "Create an index to search for similar samples by image or text."
                : "Install the Brain plugin or compute the similarity index via Python SDK."}
            </Text>
          </div>
        </div>

        <div style={s.divider} />

        {hasBrainOperator ? (
          <div style={s.noBrainKeysCta}>
            <ComputeSimilarityButton />
            <Text variant={TextVariant.Md} color={TextColor.Muted}>
              or create an index via{" "}
              <span
                style={{ textDecoration: "underline", cursor: "pointer" }}
                onClick={() => window.open(DOCS_URL, "_blank")}
              >
                Python SDK
              </span>
            </Text>
          </div>
        ) : (
          <>
            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Md}
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
                variant={TextVariant.Md}
                color={TextColor.Muted}
                style={{ marginTop: 10 }}
              >
                Enterprise: ask your admin to install via Settings &gt; Plugins.
              </Text>
            </div>

            <div style={s.divider} />

            <div style={s.noBrainKeysSection}>
              <Text
                variant={TextVariant.Md}
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

            <div style={s.divider} />

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

function RunActions({
  run,
  isExpanded,
  onApply,
  onClone,
  onDelete,
  onToggleExpand,
}: {
  run: SimilarityRun;
  isExpanded: boolean;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onToggleExpand: (run: SimilarityRun) => void;
}) {
  const isImage = run.query_type === "image";

  return (
    <div style={s.actionButtons}>
      <Tooltip content={tip("Show results")}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          leadingIcon={ApplyIcon}
          onClick={() => onApply(run.run_id)}
          disabled={run.status !== "completed"}
        />
      </Tooltip>
      <Tooltip content={tip("Clone search")}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          leadingIcon={CloneIcon}
          onClick={() => onClone(run.run_id)}
        />
      </Tooltip>
      <Tooltip content={tip("Delete")}>
        <Button
          size={Size.Sm}
          variant={Variant.Borderless}
          leadingIcon={DeleteIcon}
          onClick={() => onDelete(run.run_id)}
        />
      </Tooltip>
      {isImage && (
        <Tooltip content={isExpanded ? tip("Collapse") : tip("Show samples")}>
          <Button
            size={Size.Sm}
            variant={Variant.Borderless}
            leadingIcon={isExpanded ? ExpandLessIcon : ExpandMoreIcon}
            onClick={() => onToggleExpand(run)}
          />
        </Tooltip>
      )}
    </div>
  );
}

function ExpandedThumbnails({
  run,
  sampleMedia,
}: {
  run: SimilarityRun;
  sampleMedia: Record<string, string>;
}) {
  const positiveIds = Array.isArray(run.query) ? run.query : [];
  const negativeIds = run.negative_query_ids ?? [];

  if (!positiveIds.length && !negativeIds.length) return null;

  return (
    <div style={s.expandedSection}>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {positiveIds.length > 0 && (
          <div>
            <Text
              variant={TextVariant.Md}
              color={TextColor.Success}
              style={{ marginBottom: "0.375rem" }}
            >
              Positive ({positiveIds.length})
            </Text>
            <SampleThumbnails ids={positiveIds} sampleMedia={sampleMedia} />
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
            <SampleThumbnails ids={negativeIds} sampleMedia={sampleMedia} />
          </div>
        )}
      </Stack>
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
      // RichList gives us the full selected array — sync it
      const currentIds = new Set(selectedIds);
      // Determine what changed and forward to parent
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
        <Heading level="h2">Similarity Search</Heading>
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
          <Text color={TextColor.Secondary}>No runs match your filters</Text>
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
