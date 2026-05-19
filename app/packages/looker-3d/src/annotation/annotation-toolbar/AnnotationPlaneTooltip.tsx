import { Box, styled } from "@mui/material";
import { Orientation, Spacing, Stack, Text, TextColor } from "@voxel51/voodo";

const TooltipContainer = styled(Box)(() => ({
  maxWidth: "300px",
}));

/**
 * Custom tooltip component for the annotation plane toggle action.
 * Provides detailed explanation of the annotation plane concept.
 */
export const AnnotationPlaneTooltip = () => {
  return (
    <TooltipContainer>
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text color={TextColor.Secondary}>
          Toggle annotation plane visibility
        </Text>

        <Text color={TextColor.Secondary}>
          The transformable annotation plane solves the z-depth problem by
          providing a reference surface for drawing vertices. Vertices snap to
          the plane by default.
        </Text>
      </Stack>
    </TooltipContainer>
  );
};
