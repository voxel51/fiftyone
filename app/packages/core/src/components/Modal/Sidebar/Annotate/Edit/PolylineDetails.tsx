import { polylinePointTransformsAtom } from "@fiftyone/looker-3d/src/state";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { currentData } from "./state";

export const PolylineDetails = () => {
  const currentDataValue = useAtomValue(currentData);
  const polylinePointTransforms =
    useRecoilValue(polylinePointTransformsAtom) ?? {};

  const { segmentCount, vertexCount } = useMemo(() => {
    let segments = 0;
    let totalVertices = 0;

    if (
      currentDataValue?._id &&
      polylinePointTransforms[currentDataValue._id]
    ) {
      const transformData = polylinePointTransforms[currentDataValue._id];
      if (transformData?.segments) {
        segments = transformData.segments.length;
        totalVertices = transformData.segments.reduce((total, segment) => {
          return total + (segment.points ? segment.points.length : 0);
        }, 0);
        return {
          segmentCount: segments,
          vertexCount: totalVertices,
        };
      }
    }

    return { segmentCount: 0, vertexCount: 0 };
  }, [currentDataValue, polylinePointTransforms]);

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
