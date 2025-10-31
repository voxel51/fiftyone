import { useTheme } from "@fiftyone/components";
import { Box, Typography, styled } from "@mui/material";

const TooltipContainer = styled(Box)(({ theme }) => ({
  maxWidth: "300px",
  lineHeight: "1.4",
}));

/**
 * Custom tooltip component for the annotation plane toggle action.
 * Provides detailed explanation of the annotation plane concept.
 */
export const AnnotationPlaneTooltip = () => {
  const theme = useTheme() as any;

  return (
    <TooltipContainer>
      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: "bold",
          marginBottom: "8px",
        }}
      >
        Toggle annotation plane visibility
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontSize: "13px",
        }}
      >
        The transformable annotation plane solves the z-depth problem by
        providing a reference surface for drawing vertices. Vertices snap to the
        plane by default.
      </Typography>
    </TooltipContainer>
  );
};
