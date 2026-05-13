import { DetectionIcon } from "@fiftyone/components";
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
import { InferenceStatus } from "@fiftyone/annotation/src/agents";

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

export const AIInferringStatus = ({
  status,
}: {
  status: InferenceStatus;
}): ReactElement => {
  const statusLabels: Record<InferenceStatus, string> = {
    inferring: "Running inference",
    idle: "No inference running",
  };

  return (
    <Stack
      orientation={Orientation.Row}
      align={Align.Center}
      spacing={Spacing.Sm}
    >
      <Spinner size={Size.Md} color={TextColor.Secondary} />
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        {statusLabels[status]}
      </Text>
    </Stack>
  );
};

export const AIFirstClickStatus = (): ReactElement => (
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

export const AIPromptStatus = (): ReactElement => (
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
