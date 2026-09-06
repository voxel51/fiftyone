/**
 * Running.
 *
 * The hint about closing the panel is load-bearing, not reassurance: the
 * upload really does continue, because the worker thread outlives the
 * request stream and keeps writing the execution store.
 */

// The package root, not `@mui/material/LinearProgress`: the plugin build
// externalizes `@mui/material` by name, and a deep path would come out of
// the UMD as a global that does not exist.
import { LinearProgress } from "@mui/material";
import {
  Card,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";

import { stageLabel } from "../copy";
import { PushData } from "../types";

export interface ProgressCardProps {
  push: PushData;
}

export function ProgressCard(props: ProgressCardProps) {
  const { stage, done, total } = props.push;
  const determinate = total > 0;

  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        {/*
        voodo has no progress bar and @mui/material is external to the
        bundle, so this costs nothing to reach for.
      */}
        <LinearProgress
          variant={determinate ? "determinate" : "indeterminate"}
          value={determinate ? Math.min(100, (done / total) * 100) : undefined}
        />
        <Text>{stageLabel(stage, done, total)}</Text>
        {/*
        There is no cancel button: aborting the operator would close the
        stream without stopping the thread, and a cancel that does not
        cancel is worse than none.
      */}
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          You can close this panel — progress is kept and re-running resumes
        </Text>
      </Stack>
    </Card>
  );
}
