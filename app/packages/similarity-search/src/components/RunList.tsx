import {
  Button,
  Heading,
  Icon,
  IconName,
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
import React from "react";
import { SimilarityRun } from "../types";
import StatusBadge from "./StatusBadge";

type RunListProps = {
  runs: SimilarityRun[];
  appliedRunId?: string;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onRefresh: () => void;
  onNewSearch: () => void;
};

function formatQuery(run: SimilarityRun): string {
  if (run.query_type === "text" && typeof run.query === "string") {
    return run.query.length > 50
      ? run.query.substring(0, 50) + "..."
      : run.query;
  }
  if (run.query_type === "image") {
    const count = Array.isArray(run.query) ? run.query.length : 0;
    return `Image similarity (${count} ${count === 1 ? "sample" : "samples"})`;
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

const ApplyIcon = () => <Icon name={IconName.Enter} size={Size.Md} />;
const CloneIcon = () => <Icon name={IconName.Redo} size={Size.Md} />;
const DeleteIcon = () => <Icon name={IconName.Delete} size={Size.Md} />;
const RefreshIcon = () => <Icon name={IconName.Refresh} size={Size.Md} />;
const AddIcon = () => <Icon name={IconName.Add} size={Size.Sm} />;

export default function RunList({
  runs,
  appliedRunId,
  onApply,
  onClone,
  onDelete,
  onRefresh,
  onNewSearch,
}: RunListProps) {
  return (
    <div className="p-4 h-full">
      <Stack
        orientation={Orientation.Row}
        className="justify-between items-center mb-4"
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
          {runs.map((run) => (
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
                <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                  <Stack
                    orientation={Orientation.Row}
                    spacing={Spacing.Sm}
                    className="items-center"
                  >
                    <Text
                      variant={TextVariant.Sm}
                      color={TextColor.Primary}
                      className="font-bold"
                    >
                      {run.run_name}
                    </Text>
                    <StatusBadge status={run.status} />
                    {run.status === "completed" && (
                      <Text variant={TextVariant.Xs} color={TextColor.Muted}>
                        {run.result_count} results
                      </Text>
                    )}
                  </Stack>
                  <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                    {formatQuery(run)} {"\u00B7"} {run.brain_key}
                    {run.k ? ` \u00B7 k=${run.k}` : ""}
                    {run.reverse ? " (least similar)" : ""}
                  </Text>
                  <Text variant={TextVariant.Xs} color={TextColor.Muted}>
                    {formatTime(run.creation_time)}
                  </Text>
                  {run.status === "failed" && run.status_details && (
                    <Text
                      variant={TextVariant.Xs}
                      color={TextColor.Destructive}
                    >
                      {run.status_details}
                    </Text>
                  )}
                </Stack>

                <Stack
                  orientation={Orientation.Row}
                  spacing={Spacing.Xs}
                  className="shrink-0"
                >
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
                      variant={Variant.Danger}
                      leadingIcon={DeleteIcon}
                      onClick={() => onDelete(run.run_id)}
                    />
                  </Tooltip>
                </Stack>
              </Stack>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
