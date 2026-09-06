/**
 * Planning. The scan walks every sample and can run for minutes, so this
 * exists purely so the panel is never silent.
 */

import {
  Align,
  Card,
  Orientation,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
} from "@voxel51/voodo";

import { PushData } from "../types";

export interface PlanningCardProps {
  push: PushData;
}

export function PlanningCard(props: PlanningCardProps) {
  const { total } = props.push;

  return (
    <Card>
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Spinner size={Size.Sm} />
        <Text>
          {total > 0
            ? `Preparing upload… scanning ${total} samples`
            : "Preparing upload…"}
        </Text>
      </Stack>
    </Card>
  );
}
