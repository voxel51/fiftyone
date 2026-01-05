import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { currentData } from "./state";

export const PolylineDetails = () => {
  const currentDataValue = useAtomValue(
    currentData
  ) as fos.PolylineAnnotationLabel["data"];

  const { segmentCount, vertexCount } = useMemo(() => {
    if (!currentDataValue?.points3d) {
      return { segmentCount: 0, vertexCount: 0 };
    }

    const segments = currentDataValue.points3d?.length ?? 0;
    const totalVertices =
      currentDataValue.points3d?.reduce((total, segment) => {
        return total + segment.length;
      }, 0) ?? 0;

    return {
      segmentCount: segments,
      vertexCount: totalVertices,
    };
  }, [currentDataValue]);

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Typography
        variant="body2"
        sx={{
          fontSize: "0.875rem",
          letterSpacing: "0.025em",
          color: "text.secondary",
        }}
      >
        {segmentCount > 1 && (
          <>
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                fontSize: "inherit",
              }}
            >
              {segmentCount}
            </Box>
            <Box component="span" sx={{ ml: 0.5 }}>
              segments
            </Box>
            <Box component="span" sx={{ mx: 0.5 }}>
              •
            </Box>
          </>
        )}
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          {vertexCount}
        </Box>
        <Box component="span" sx={{ ml: 0.5 }}>
          vertices
        </Box>
      </Typography>
    </Box>
  );
};
