import { Chip } from "@mui/material";
import React from "react";
import { RunStatus } from "../types";

const STATUS_COLORS: Record<
  RunStatus,
  "default" | "primary" | "success" | "error" | "warning"
> = {
  pending: "default",
  running: "primary",
  completed: "success",
  failed: "error",
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
    <Chip
      label={STATUS_LABELS[status] ?? status}
      color={STATUS_COLORS[status] ?? "default"}
      size="small"
      variant="outlined"
    />
  );
}
