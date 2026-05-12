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
    label="Click to draw another polyline · Click existing shape to edit"
  />
);

export const PolylineProgressStatus = ({
  vertexCount,
}: {
  vertexCount: number;
}): ReactElement => (
  <StatusItem
    icon={<Timeline fontSize="small" />}
    label={`${vertexCount} ${
      vertexCount === 1 ? "vertex" : "vertices"
    } · Right click to finish`}
  />
);

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

export const AIInferringStatus = (): ReactElement => (
  <Stack
    orientation={Orientation.Row}
    align={Align.Center}
    spacing={Spacing.Sm}
  >
    <Spinner size={Size.Md} />
    <Text variant={TextVariant.Md} color={TextColor.Primary}>
      Inferring...
    </Text>
  </Stack>
);

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
      Shift = Invert
    </Text>
    <Separator />
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      Click marker to remove
    </Text>
  </Stack>
);
