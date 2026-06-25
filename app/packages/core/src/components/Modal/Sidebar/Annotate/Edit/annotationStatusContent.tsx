import { DetectionIcon } from "@fiftyone/components";
import ErrorOutline from "@mui/icons-material/ErrorOutline";
import Brush from "@mui/icons-material/Brush";
import CallMerge from "@mui/icons-material/CallMerge";
import Timeline from "@mui/icons-material/Timeline";
import {
  Align,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { ReactElement } from "react";
import { StatusItem } from "../../../ModalStatusBar";
import {
  InferenceError,
  InferenceProgress,
  InferenceStatus,
} from "@fiftyone/annotation/src/agents";
import { ProviderErrorKind } from "@fiftyone/annotation";

export const DetectionStatus = (): ReactElement => (
  <StatusItem
    icon={<DetectionIcon />}
    label="Click and drag to create a bounding box"
  />
);

export const BrushStatus = (): ReactElement => (
  <StatusItem
    icon={<Brush fontSize="small" />}
    label="Paint to create a mask"
  />
);

export const PenStatus = (): ReactElement => (
  <StatusItem
    icon={<Timeline fontSize="small" />}
    label="Draw freeform to create a filled mask"
  />
);

export const PolylineEntryStatus = (): ReactElement => (
  <StatusItem
    icon={<Timeline fontSize="small" />}
    label="Click to start a new polyline"
  />
);

export const PolylineProgressStatus = ({
  vertexCount,
}: {
  vertexCount: number;
}): ReactElement => {
  const instructions = [
    `${vertexCount} ${vertexCount === 1 ? "vertex" : "vertices"}`,
    "Click to add a point",
    "Ctrl + click to swap segment endpoints",
    "Shift + click to start a new segment",
    "Alt + click to delete a point",
    "Right click to exit",
  ];

  return (
    <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
      {instructions.map((text, idx) => (
        <>
          <Text color={TextColor.Secondary}>{text}</Text>
          {idx < instructions.length - 1 && <Separator />}
        </>
      ))}
    </Stack>
  );
};

export const MergeInitialStatus = (): ReactElement => (
  <StatusItem
    icon={<CallMerge fontSize="small" />}
    label={
      <>
        Click the <strong>primary</strong> polygon first · its properties will
        be kept
      </>
    }
  />
);

export const MergeTargetSetStatus = (): ReactElement => (
  <StatusItem
    icon={<CallMerge fontSize="small" />}
    label="Primary set · click a polygon to merge into it"
  />
);

const STATUS_LABELS: Record<InferenceStatus, string> = {
  idle: "No inference running",
  initializing: "Initializing model",
  "downloading-weights": "Downloading model",
  "encoding-image": "Encoding image",
  inferring: "Running inference",
  error: "Inference error",
};

// Error kinds known to {@link ProviderError}; mapped to user-readable prefixes.
const ERROR_KIND_LABELS: Record<ProviderErrorKind, string> = {
  unsupported: "Unsupported browser",
  download_failure: "Failed to download model",
  encoder_failure: "Failed to encode image",
  decoder_failure: "Failed to run inference",
  inference_failure: "Inference failed",
};

const isActiveStatus = (status: InferenceStatus): boolean =>
  status !== "idle" && status !== "error";

const formatProgressLabel = (
  status: InferenceStatus,
  progress: InferenceProgress,
): string => {
  const base = STATUS_LABELS[status];
  if (status !== "downloading-weights" || !progress || !progress.total) {
    return base;
  }
  const pct = Math.min(
    100,
    Math.max(0, Math.round((progress.loaded / progress.total) * 100)),
  );
  return `${base} (${pct}%)`;
};

const formatErrorLabel = (error: InferenceError): string => {
  if (!error) {
    return STATUS_LABELS.error;
  }

  const prefix = ERROR_KIND_LABELS[error.kind] ?? STATUS_LABELS.error;
  return error.message ? `${prefix}: ${error.message}` : prefix;
};

const AIInferringStatus = ({
  status,
  progress,
}: {
  status: InferenceStatus;
  progress: InferenceProgress;
}): ReactElement => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <Spinner size={Size.Md} color={TextColor.Secondary} />
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {formatProgressLabel(status, progress)}
    </Text>
  </Stack>
);

const AIErrorStatus = ({ error }: { error: InferenceError }): ReactElement => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <ErrorOutline fontSize="small" color="error" />
    <Text variant={TextVariant.Md} color={TextColor.Destructive}>
      {formatErrorLabel(error)}
    </Text>
  </Stack>
);

const AIFirstClickStatus = (): ReactElement => (
  <Text variant={TextVariant.Md} color={TextColor.Secondary}>
    Click on an object to segment it
  </Text>
);

const Marker = ({ color, label }: { color: TextColor; label: string }) => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Xs}
  >
    <Text variant={TextVariant.Md} color={color}>
      ●
    </Text>
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {label}
    </Text>
  </Stack>
);

const Separator = () => (
  <Text variant={TextVariant.Md} color={TextColor.Tertiary}>
    ·
  </Text>
);

const AIPromptStatus = (): ReactElement => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Md}
  >
    <Marker color={TextColor.Success} label="Positive prompt" />
    <Marker color={TextColor.Destructive} label="Negative prompt" />
    <Separator />
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      Hold shift to invert positive/negative selection
    </Text>
    <Separator />
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      Click marker to remove
    </Text>
  </Stack>
);

/**
 * Single status-bar component for the AI segmentation tool.
 *
 * Picks the right sub-state based on inference status, download progress,
 * terminal error, and whether the user has placed any prompt points:
 *
 * - `"error"`            → {@link AIErrorStatus} with a readable message
 * - active inference     → {@link AIInferringStatus} with progress %
 * - no prompt points yet → {@link AIFirstClickStatus}
 * - prompt points placed → {@link AIPromptStatus}
 */
export const AISegmentationStatus = ({
  status,
  progress,
  error,
  hasPoints,
}: {
  status: InferenceStatus;
  progress: InferenceProgress;
  error: InferenceError;
  hasPoints: boolean;
}): ReactElement => {
  if (status === "error") {
    return <AIErrorStatus error={error} />;
  }

  if (isActiveStatus(status)) {
    return <AIInferringStatus status={status} progress={progress} />;
  }

  if (!hasPoints) {
    return <AIFirstClickStatus />;
  }

  return <AIPromptStatus />;
};
