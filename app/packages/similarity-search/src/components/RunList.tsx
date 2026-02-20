import Add from "@mui/icons-material/Add";
import ContentCopy from "@mui/icons-material/ContentCopy";
import Delete from "@mui/icons-material/Delete";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import GridView from "@mui/icons-material/GridView";
import Refresh from "@mui/icons-material/Refresh";
import { getSampleSrc } from "@fiftyone/state";
import {
  Button,
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
import React, { useCallback, useEffect, useRef, useState } from "react";
import { SimilarityRun } from "../types";
import StatusBadge from "./StatusBadge";

type RunListProps = {
  runs: SimilarityRun[];
  appliedRunId?: string;
  sampleMedia: Record<string, string>;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onRefresh: () => void;
  onNewSearch: () => void;
  onGetSampleMedia: (payload: { sample_ids: string[] }) => void;
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
      style={{ display: "flex", overflowX: "auto", gap: 4, paddingBottom: 4 }}
    >
      {ids.map((id) => {
        const filepath = sampleMedia[id];
        if (!filepath) {
          return (
            <div
              key={id}
              style={{
                width: 48,
                height: 48,
                minWidth: 48,
                borderRadius: 4,
                background: "#333",
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
  appliedRunId,
  sampleMedia,
  onApply,
  onClone,
  onDelete,
  onRefresh,
  onNewSearch,
  onGetSampleMedia,
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

  return (
    <div className="p-4 h-full">
      <Stack
        orientation={Orientation.Row}
        style={{ marginBottom: "1rem" }}
        className="justify-between items-center"
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
            variant={Variant.Primary}
            size={Size.Sm}
            leadingIcon={AddIcon}
            onClick={onNewSearch}
          >
            New Search
          </Button>
        </Stack>
      </Stack>

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-1/2 gap-4">
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
      ) : (
        <div className="overflow-auto flex flex-col gap-2">
          {runs.map((run) => {
            const isImage = run.query_type === "image";
            const isExpanded = expandedRunIds.has(run.run_id);
            const positiveIds = Array.isArray(run.query) ? run.query : [];
            const negativeIds = run.negative_query_ids ?? [];

            return (
              <div
                key={run.run_id}
                className={`border rounded-md p-3 ${
                  appliedRunId === run.run_id
                    ? "border-action-primary-primary bg-content-bg-card-2"
                    : "border-content-border-secondary-primary bg-content-bg-card-1"
                }`}
              >
                <Stack
                  orientation={Orientation.Row}
                  className="justify-between items-start"
                >
                  <Stack
                    orientation={Orientation.Column}
                    spacing={Spacing.Xs}
                    className="flex-1 min-w-0"
                  >
                    <Stack
                      orientation={Orientation.Row}
                      spacing={Spacing.Sm}
                      className="items-center"
                    >
                      <Text
                        variant={TextVariant.Md}
                        color={TextColor.Primary}
                        className="font-bold"
                      >
                        {run.run_name}
                      </Text>
                      <StatusBadge status={run.status} />
                      {run.status === "completed" && (
                        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
                          {run.result_count} results
                        </Text>
                      )}
                    </Stack>
                    <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                      {formatQuery(run)} {"\u00B7"} {run.brain_key}
                      {run.k ? ` \u00B7 k=${run.k}` : ""}
                      {run.reverse ? " (least similar)" : ""}
                    </Text>
                    <Text variant={TextVariant.Sm} color={TextColor.Muted}>
                      {formatTime(run.creation_time)}
                    </Text>
                    {run.status === "failed" && run.status_details && (
                      <Text
                        variant={TextVariant.Sm}
                        color={TextColor.Destructive}
                      >
                        {run.status_details}
                      </Text>
                    )}
                  </Stack>

                  <Stack
                    orientation={Orientation.Column}
                    spacing={Spacing.Xs}
                    className="shrink-0 items-end"
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
                        style={{ display: "flex", justifyContent: "flex-end" }}
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
                </Stack>

                {isImage && isExpanded && (
                  <div className="mt-3 pt-3 border-t border-content-border-secondary-primary">
                    <Stack
                      orientation={Orientation.Column}
                      spacing={Spacing.Sm}
                    >
                      {positiveIds.length > 0 && (
                        <div>
                          <Text
                            variant={TextVariant.Sm}
                            color={TextColor.Success}
                            className="mb-1.5"
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
                            variant={TextVariant.Sm}
                            color={TextColor.Destructive}
                            className="mb-1.5"
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
    </div>
  );
}
