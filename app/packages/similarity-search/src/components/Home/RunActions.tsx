import {
  Button,
  IconName,
  Size,
  Stack,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { QUERY_IMAGE } from "../../constants";
import { SimilarityRun } from "../../types";
import { tooltipTextStyle } from "../styled";

const tip = (text: string) => <span style={tooltipTextStyle}>{text}</span>;

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
  const isImage = run.query_type === QUERY_IMAGE && !run.patches_field;

  return (
    <Stack>
      <Tooltip content={tip("Show results")}>
        <Button
          aria-label="Show results"
          size={Size.Md}
          variant={Variant.Borderless}
          leadingIcon={IconName.GridView}
          onClick={() => onApply(run.run_id)}
          disabled={run.status !== "completed"}
        />
      </Tooltip>
      <Tooltip content={tip("Clone search")}>
        <Button
          aria-label="Clone search"
          size={Size.Md}
          variant={Variant.Borderless}
          leadingIcon={IconName.ContentCopy}
          onClick={() => onClone(run.run_id)}
        />
      </Tooltip>
      <Tooltip content={tip("Delete")}>
        <Button
          aria-label="Delete"
          size={Size.Md}
          variant={Variant.Borderless}
          leadingIcon={IconName.Delete}
          onClick={() => onDelete(run.run_id)}
        />
      </Tooltip>
      {isImage && (
        <Tooltip content={isExpanded ? tip("Collapse") : tip("Show prompts")}>
          <Button
            aria-label={isExpanded ? "Collapse" : "Show prompts"}
            size={Size.Md}
            variant={Variant.Borderless}
            leadingIcon={
              isExpanded ? IconName.ChevronTop : IconName.ChevronBottom
            }
            onClick={() => onToggleExpand(run)}
          />
        </Tooltip>
      )}
    </Stack>
  );
}
