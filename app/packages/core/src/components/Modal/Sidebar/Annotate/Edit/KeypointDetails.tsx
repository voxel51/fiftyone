import { Box } from "@mui/material";
import { useAnnotationContext } from "./state";
import { Text, TextColor } from "@voxel51/voodo";
import { KeypointAnnotationLabel } from "@fiftyone/state";

export const KeypointDetails = () => {
  const { selectedLabel } = useAnnotationContext();
  const currentData = selectedLabel?.data as KeypointAnnotationLabel["data"];

  const pointCount = currentData?.points?.length ?? 0;

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Text color={TextColor.Secondary}>{pointCount} points</Text>
    </Box>
  );
};
