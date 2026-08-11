import {
  Align,
  Button,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { QueryType, RunStatus, SimilarityRun } from "../../types";
import { tooltipTextStyle } from "../styled";

const tip = (text: string) => <span style={tooltipTextStyle}>{text}</span>;

/** Wrap a handler to stop propagation so card-level onClick doesn't fire. */
const stop =
  (fn: () => void): React.MouseEventHandler =>
  (e) => {
    e.stopPropagation();
    fn();
  };

type RunActionsProps = {
  run: SimilarityRun;
  isExpanded: boolean;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onDelete: (runId: string) => void;
  onToggleExpand: (run: SimilarityRun) => void;
};

export default function RunActions({
  run,
  isExpanded,
  onApply,
  onClone,
  onDelete,
  onToggleExpand,
}: RunActionsProps) {
  const isImage = run.query_type === QueryType.Image && !run.patches_field;
  // Upload runs can't be cloned — the original image isn't persisted.
  const isUpload = run.query_type === QueryType.Upload;

  return (
    <Stack
      orientation={Orientation.Column}
      align={Align.End}
      spacing={Spacing.Xl}
    >
      <Stack>
        <Tooltip content={tip("Show results")}>
          <Button
            aria-label="Show results"
            size={Size.Md}
            variant={Variant.Borderless}
            leadingIcon={IconName.GridView}
            onClick={stop(() => onApply(run.run_id))}
            disabled={run.status !== RunStatus.Completed}
          />
        </Tooltip>
        <Tooltip
          content={tip(
            isUpload
              ? "Clone is not supported for file upload searches"
              : "Clone search",
          )}
        >
          {/* span wrapper lets the tooltip still fire on hover when the
              underlying button is disabled */}
          <span>
            <Button
              aria-label="Clone search"
              size={Size.Md}
              variant={Variant.Borderless}
              leadingIcon={IconName.ContentCopy}
              onClick={stop(() => onClone(run.run_id))}
              disabled={isUpload}
            />
          </span>
        </Tooltip>
        <Tooltip content={tip("Delete")}>
          <Button
            aria-label="Delete"
            size={Size.Md}
            variant={Variant.Borderless}
            leadingIcon={IconName.Delete}
            onClick={stop(() => onDelete(run.run_id))}
          />
        </Tooltip>
      </Stack>
      {isImage && (
        <Stack>
          <Tooltip content={isExpanded ? tip("Collapse") : tip("Show prompts")}>
            <Button
              aria-label={isExpanded ? "Collapse" : "Show prompts"}
              size={Size.Md}
              variant={Variant.Borderless}
              leadingIcon={
                isExpanded ? IconName.ChevronTop : IconName.ChevronBottom
              }
              onClick={stop(() => onToggleExpand(run))}
            />
          </Tooltip>
        </Stack>
      )}
    </Stack>
  );
}
