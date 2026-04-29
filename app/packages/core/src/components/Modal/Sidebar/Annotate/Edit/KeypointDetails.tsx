import { Box } from "@mui/material";
import { useAnnotationContext } from "./state";
import {
  Align,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  Tooltip,
  TooltipProps,
} from "@voxel51/voodo";
import {
  KeypointAnnotationLabel,
  useGetKeypointSkeleton,
} from "@fiftyone/state";
import { useMemo } from "react";

const ConditionalTooltip = ({
  anchor,
  children,
  content,
  enabled,
}: Pick<TooltipProps, "anchor" | "children" | "content"> & {
  enabled: boolean;
}) => {
  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip portal content={content} anchor={anchor}>
      {children}
    </Tooltip>
  );
};

export const KeypointDetails = () => {
  const { selectedLabel } = useAnnotationContext();
  const currentData = selectedLabel?.data as KeypointAnnotationLabel["data"];
  const getKeypointSkeleton = useGetKeypointSkeleton();

  const keypointSkeleton = useMemo(() => {
    if (selectedLabel?.path) {
      return getKeypointSkeleton(selectedLabel.path);
    }

    return undefined;
  }, [getKeypointSkeleton, selectedLabel?.path]);

  const pointCount = currentData?.points?.length ?? 0;

  return (
    <Box sx={{ py: 1 }}>
      <Stack
        orientation={Orientation.Row}
        align={Align.Center}
        spacing={Spacing.Sm}
      >
        <Text color={TextColor.Secondary}>
          {keypointSkeleton?.edges?.length ?? 0} edges
        </Text>

        <Text color={TextColor.Secondary}>&bull;</Text>

        <ConditionalTooltip
          enabled={keypointSkeleton?.labels?.length > 0}
          content={<Text>{keypointSkeleton?.labels?.join(", ")}</Text>}
        >
          <Text color={TextColor.Secondary}>{pointCount} points</Text>
        </ConditionalTooltip>
      </Stack>
    </Box>
  );
};
