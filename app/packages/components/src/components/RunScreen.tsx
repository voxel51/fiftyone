import {
  Align,
  Button,
  Card,
  IconName,
  Justify,
  Loader,
  Modal,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState, type ReactNode } from "react";

export type RunScreenStatus =
  | "scheduled"
  | "queued"
  | "running"
  | "in_progress"
  | "failed";

export interface RunScreenProps {
  title: string;
  variant?: "default" | "gradient";
  /** Panel header next to the back action */
  header?: { title: string; subtitle?: string };
  description?: ReactNode;
  status?: RunScreenStatus;
  runTitle?: string;
  runDetail?: string;
  /** Overrides the message the status would pick */
  message?: ReactNode;
  /** Defaults to failure when the status is failed */
  messageTone?: "default" | "failure";
  /** Draws an accent bar beside the message */
  accent?: boolean;
  hideLoader?: boolean;
  hideRun?: boolean;
  backLabel?: string;
  onBack?: () => void;
  viewStatusLabel?: string;
  onViewStatus?: () => void;
  viewStatusDisabled?: boolean;
  stopLabel?: string;
  onStop?: () => void | Promise<void>;
  stopDisabled?: boolean;
  stopping?: boolean;
  /** Asks before stopping; omit to stop immediately */
  stopConfirm?: { title: string; content?: ReactNode; confirmText?: string };
}

const MESSAGES: Record<RunScreenStatus, string> = {
  scheduled: "Results will appear when the job is finished.",
  queued: "Waiting for a worker to pick up this job.",
  running: "Results will appear when the job is finished.",
  in_progress: "Results will appear when the job is finished.",
  failed: "This job failed.",
};

export default function RunScreen({
  title,
  variant = "default",
  header,
  description,
  status = "scheduled",
  runTitle,
  runDetail,
  message,
  messageTone,
  accent,
  hideLoader,
  hideRun,
  backLabel = "Back",
  onBack,
  viewStatusLabel = "View status",
  onViewStatus,
  viewStatusDisabled,
  stopLabel = "Stop",
  onStop,
  stopDisabled,
  stopping,
  stopConfirm,
}: RunScreenProps) {
  const gradient = variant === "gradient";
  const failure =
    (messageTone ?? (status === "failed" ? "failure" : "default")) ===
    "failure";
  const [confirming, setConfirming] = useState(false);

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Lg}
      style={{ padding: 16, height: "100%" }}
    >
      {(onBack || header) && (
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Stack align={Align.Center} spacing={Spacing.Sm}>
            {onBack && (
              <Button
                size={Size.Sm}
                variant={Variant.Borderless}
                leadingIcon={IconName.ArrowLeft}
                onClick={onBack}
              >
                {backLabel}
              </Button>
            )}
            {header && (
              <Text variant={TextVariant.HeadingMd}>{header.title}</Text>
            )}
          </Stack>
          {header?.subtitle && (
            <Text variant={TextVariant.Md} color={TextColor.Muted}>
              {header.subtitle}
            </Text>
          )}
        </Stack>
      )}
      <Stack
        orientation={Orientation.Column}
        align={Align.Center}
        spacing={Spacing.Lg}
        style={{ flex: 1, justifyContent: "center", textAlign: "center" }}
      >
        {!hideLoader && (
          <Loader
            type={gradient ? "bars" : "spinner"}
            size={Size.Xl}
            role="status"
            aria-label="Loading"
          />
        )}
        <Stack
          orientation={Orientation.Column}
          align={Align.Center}
          spacing={Spacing.Sm}
        >
          <Text variant={TextVariant.HeadingLg} gradient={gradient}>
            {title}
          </Text>
          {description && (
            <Text variant={TextVariant.Md} color={TextColor.Muted}>
              {description}
            </Text>
          )}
        </Stack>
        {!hideRun && (
          <Card
            outlined
            data-testid="run-card"
            style={{ width: "100%", maxWidth: 560, textAlign: "left" }}
          >
            <Stack
              align={Align.Center}
              justify={Justify.Between}
              spacing={Spacing.Lg}
            >
              <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
                {(runTitle || runDetail) && (
                  <Stack
                    align={Align.Center}
                    spacing={Spacing.Sm}
                    style={{ flexWrap: "wrap" }}
                  >
                    {runTitle && (
                      <Text variant={TextVariant.HeadingMd}>{runTitle}</Text>
                    )}
                    {runDetail && (
                      <span style={{ whiteSpace: "nowrap" }}>
                        <Text variant={TextVariant.Md} color={TextColor.Muted}>
                          {runTitle ? `• ${runDetail}` : runDetail}
                        </Text>
                      </span>
                    )}
                  </Stack>
                )}
                <Stack spacing={Spacing.Sm}>
                  {accent && (
                    <div
                      data-testid="run-accent"
                      style={{
                        width: 2,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: "currentColor",
                        opacity: 0.6,
                      }}
                    />
                  )}
                  <Text
                    variant={TextVariant.Md}
                    color={failure ? TextColor.Failure : TextColor.Secondary}
                  >
                    {message ?? MESSAGES[status]}
                  </Text>
                </Stack>
              </Stack>
              {(onViewStatus || onStop) && (
                <Stack spacing={Spacing.Sm} style={{ flexShrink: 0 }}>
                  {onViewStatus && (
                    <Button
                      size={Size.Sm}
                      variant={Variant.Secondary}
                      disabled={viewStatusDisabled}
                      onClick={onViewStatus}
                    >
                      {viewStatusLabel}
                    </Button>
                  )}
                  {onStop && (
                    <Button
                      size={Size.Sm}
                      variant={Variant.Secondary}
                      disabled={stopDisabled || stopping}
                      onClick={stopConfirm ? () => setConfirming(true) : onStop}
                    >
                      {stopping ? "Stopping…" : stopLabel}
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
      {stopConfirm && onStop && (
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          title={stopConfirm.title}
          size="sm"
          footer={
            <Stack spacing={Spacing.Sm} justify={Justify.End}>
              <Button
                variant={Variant.Secondary}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                variant={Variant.Danger}
                onClick={() => {
                  setConfirming(false);
                  onStop();
                }}
              >
                {stopConfirm.confirmText ?? stopLabel}
              </Button>
            </Stack>
          }
        >
          {stopConfirm.content}
        </Modal>
      )}
    </Stack>
  );
}
