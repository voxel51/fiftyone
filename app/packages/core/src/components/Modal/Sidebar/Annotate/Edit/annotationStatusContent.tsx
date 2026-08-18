import ErrorOutline from "@mui/icons-material/ErrorOutline";
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
import {
  StatusContent,
  StatusHelp,
  StatusHelpEntry,
} from "../../../ModalStatusBar";
import {
  InferenceError,
  InferenceProgress,
  InferenceStatus,
} from "@fiftyone/annotation/src/agents";
import { ProviderErrorKind } from "@fiftyone/annotation";

const StatusText = ({
  children,
  color = TextColor.Secondary,
}: {
  children: string;
  color?: TextColor;
}): ReactElement => (
  <Text variant={TextVariant.Sm} color={color}>
    {children}
  </Text>
);

const DETECTION_2D_HELP: StatusHelpEntry[] = [
  { gesture: "Click and drag", description: "Draw a new bounding box" },
  {
    gesture: "Right click",
    description: "Stop editing this box; again to leave the tool",
  },
];

const DETECTION_3D_HELP: StatusHelpEntry[] = [
  { gesture: "C", description: "Toggle cuboid creation on and off" },
  {
    gesture: "Three clicks",
    description: "Set the first corner, then the orientation, then the width",
  },
  {
    gesture: "T / R / S",
    description: "Translate, rotate, or scale the selection",
  },
  {
    gesture: "Shift + hover",
    description: "Crop the side panels to the point under the cursor",
  },
  // Right click is reserved for camera panning in 3D, so Escape is the only
  // cancel/exit gesture here.
  {
    gesture: "Escape",
    description: "Cancel the cuboid you are creating, or exit edit mode",
  },
];

export const detectionStatus = (isCuboid = false): StatusContent => ({
  help: isCuboid ? (
    <StatusHelp title="Cuboid" entries={DETECTION_3D_HELP} />
  ) : (
    <StatusHelp title="Bounding box" entries={DETECTION_2D_HELP} />
  ),
});

const BRUSH_HELP: StatusHelpEntry[] = [
  { gesture: "Click and drag", description: "Paint a mask" },
  {
    gesture: "Right click",
    description: "Stop editing this mask; again to leave the tool",
  },
];

export const brushStatus = (): StatusContent => ({
  help: <StatusHelp title="Brush" entries={BRUSH_HELP} />,
});

const PEN_HELP: StatusHelpEntry[] = [
  {
    gesture: "Click or drag",
    description:
      "Click to place a series of connected points, or drag to draw a continuous shape",
  },
  {
    gesture: "Right click",
    description: "Commit the shape you are drawing",
  },
  {
    gesture: "Right click again",
    description: "Stop editing this mask, then leave the tool",
  },
];

export const penStatus = (): StatusContent => ({
  help: <StatusHelp title="Pen" entries={PEN_HELP} />,
});

const POLYLINE_ENTRY_HELP: StatusHelpEntry[] = [
  { gesture: "Click", description: "Place the first vertex of a new polyline" },
  { gesture: "Right click", description: "Leave polyline mode" },
];

export const polylineEntryStatus = (): StatusContent => ({
  help: <StatusHelp title="Polyline" entries={POLYLINE_ENTRY_HELP} />,
});

const POLYLINE_PROGRESS_HELP: StatusHelpEntry[] = [
  { gesture: "Click", description: "Add a point to the current segment" },
  { gesture: "Drag a point", description: "Move that vertex" },
  { gesture: "Click an edge", description: "Insert a vertex on that edge" },
  {
    gesture: "Ctrl + click",
    description: "Extend from the other end of the current segment",
  },
  { gesture: "Shift + click", description: "Start a new, separate segment" },
  { gesture: "Alt + click", description: "Delete the point you clicked" },
  {
    gesture: "Right click",
    description: "Finish this polyline; again to leave polyline mode",
  },
];

export const polylineProgressStatus = (): StatusContent => ({
  help: <StatusHelp title="Polyline" entries={POLYLINE_PROGRESS_HELP} />,
});

const MERGE_HELP: StatusHelpEntry[] = [
  {
    gesture: "First click",
    description: "Pick the primary mask — its properties are kept",
  },
  {
    gesture: "Second click",
    description:
      "Merge that mask into the primary; the source label is removed",
  },
  { gesture: "Right click", description: "Clear the primary and leave merge" },
];

const mergeHelp = <StatusHelp title="Merge masks" entries={MERGE_HELP} />;

export const mergeInitialStatus = (): StatusContent => ({
  help: mergeHelp,
});

export const mergeTargetSetStatus = (): StatusContent => ({
  status: <StatusText>Primary set</StatusText>,
  help: mergeHelp,
});

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
    <Spinner size={Size.Sm} color={TextColor.Secondary} />
    <StatusText>{formatProgressLabel(status, progress)}</StatusText>
  </Stack>
);

const AIErrorStatus = ({ error }: { error: InferenceError }): ReactElement => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <ErrorOutline fontSize="small" color="error" />
    <StatusText color={TextColor.Destructive}>
      {error ? ERROR_KIND_LABELS[error.kind] : STATUS_LABELS.error}
    </StatusText>
  </Stack>
);

const Marker = ({ color, label }: { color: TextColor; label: string }) => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Xs}
  >
    <Text variant={TextVariant.Sm} color={color}>
      ●
    </Text>
    <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
      {label}
    </Text>
  </Stack>
);

const AI_SEGMENTATION_HELP: StatusHelpEntry[] = [
  {
    gesture: "Click",
    description:
      "Add a point prompt. Clicking an empty region adds a positive point, which includes the region in the resulting mask. Clicking on an existing masked region adds a negative point, which removes the region from the resulting mask",
  },
  {
    gesture: "Shift + click",
    description: "Invert positive/negative for that click",
  },
  { gesture: "Click a marker", description: "Remove that prompt point" },
  {
    gesture: "Right click",
    description: "Commit the mask and start a new one",
  },
  {
    gesture: "Right click again",
    description: "Deselect the mask, then leave the tool",
  },
];

const aiSegmentationHelp = (
  <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
    <StatusHelp title="AI segmentation" entries={AI_SEGMENTATION_HELP} />
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Md}
    >
      <Marker color={TextColor.Success} label="Positive prompt" />
      <Marker color={TextColor.Destructive} label="Negative prompt" />
    </Stack>
  </Stack>
);

// The message is only ever shown here: the inline status carries the short
// error kind so it cannot crowd the panel tabs.
const aiErrorHelp = (error: InferenceError): ReactElement | undefined => {
  if (!error || !error.message) return undefined;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Text variant={TextVariant.Label} color={TextColor.Primary}>
        {ERROR_KIND_LABELS[error.kind] ?? STATUS_LABELS.error}
      </Text>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        {error.message}
      </Text>
    </Stack>
  );
};

/**
 * Status content for the AI segmentation tool.
 *
 * Only machine state goes inline — download progress, a short error kind — so
 * the gesture table stays behind the help affordance in every state. The help
 * content is deliberately identical across idle and inference states: the
 * gestures do not change, and swapping it would make the affordance flicker
 * while the model works.
 */
export const aiSegmentationStatus = ({
  status,
  progress,
  error,
}: {
  status: InferenceStatus;
  progress: InferenceProgress;
  error: InferenceError;
}): StatusContent => {
  if (status === "error") {
    return {
      status: <AIErrorStatus error={error} />,
      help: aiErrorHelp(error),
    };
  }

  if (isActiveStatus(status)) {
    return {
      status: <AIInferringStatus status={status} progress={progress} />,
      help: aiSegmentationHelp,
    };
  }

  return { help: aiSegmentationHelp };
};
