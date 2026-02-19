import { Pill, TextColor } from "@voxel51/voodo";
import React from "react";
import { RunStatus } from "../types";

const STATUS_COLORS: Record<RunStatus, TextColor> = {
  pending: TextColor.Muted,
  running: TextColor.Info,
  completed: TextColor.Success,
  failed: TextColor.Destructive,
};

const STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

type StatusBadgeProps = {
  status: RunStatus;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Pill size="xs" color={STATUS_COLORS[status] ?? TextColor.Muted} isStatus>
      {STATUS_LABELS[status] ?? status}
    </Pill>
  );
}
