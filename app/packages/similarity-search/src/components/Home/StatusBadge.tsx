import { Pill, TextColor } from "@voxel51/voodo";
import React from "react";
import { RunStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../constants";

type StatusBadgeProps = {
  status: RunStatus;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Pill size="sm" color={STATUS_COLORS[status] ?? TextColor.Muted} isStatus>
      {STATUS_LABELS[status] ?? status}
    </Pill>
  );
}
