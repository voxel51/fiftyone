import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { currentData } from "./useAnnotationContext/selectors";
import type { Coordinates } from "@fiftyone/looker/src/state";

/**
 * Counts the number of segments in the coordinates matrix.
 *
 * Coordinates are expressed in the form
 * ```typescript
 * [
 *   // segment 0
 *   [vertex0, vertex1, vertex2],
 *   // segment 1
 *   [vertex3, vertex4],
 *   // ...
 * ]
 * ```
 * @param points Coordinate array
 */
const countSegments = (points: Coordinates[][] | undefined): number => {
  return points?.length ?? 0;
};

/**
 * Counts the number of vertices in the coordinates matrix.
 *
 * Coordinates are expressed in the form
 * ```typescript
 * [
 *   // segment 0
 *   [vertex0, vertex1, vertex2],
 *   // segment 1
 *   [vertex3, vertex4],
 *   // ...
 * ]
 * ```
 * @param points Coordinate array
 */
const countVertices = (points: Coordinates[][] | undefined): number => {
  return (
    points?.reduce((total, segment) => {
      return total + segment.length;
    }, 0) ?? 0
  );
};

export const PolylineDetails = () => {
  const currentDataValue = useAtomValue(
    currentData
  ) as fos.PolylineAnnotationLabel["data"];

  const { segmentCount, vertexCount } = useMemo(() => {
    const points = currentDataValue?.points3d ?? currentDataValue?.points;
    return {
      segmentCount: countSegments(points),
      vertexCount: countVertices(points),
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
