import { Size, StatusColor, VisibilityIcon } from "@voxel51/voodo";
import RunCard from "./RunCard";

const STATE_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  queued: "Queued",
  running: "Running",
  processing: "Running",
  failed: "Failed",
};

export interface PendingRunCardProps {
  title: string;
  runState: string;
  /** Makes the card clickable; omit for a status-only card */
  onOpen?: () => void;
  /** Adds a "View run" menu item; omit where there is no run page */
  onViewRun?: () => void;
}

export default function PendingRunCard({
  title,
  runState,
  onOpen,
  onViewRun,
}: PendingRunCardProps) {
  return (
    <RunCard
      title={title}
      status={{
        label: STATE_LABELS[runState] ?? runState,
        color:
          runState === "failed"
            ? StatusColor.FailedText
            : StatusColor.ProgressText,
      }}
      actions={
        onViewRun
          ? [
              {
                id: "view",
                label: "View run",
                icon: <VisibilityIcon size={Size.Md} />,
                onClick: onViewRun,
              },
            ]
          : []
      }
      onOpen={onOpen}
    />
  );
}
