import {
  useAnnotationEngine,
  useEngineSelector,
  useSceneSampleId,
} from "@fiftyone/annotation";
import * as fos from "@fiftyone/state";
import { Box, Typography } from "@mui/material";
import { useMemo } from "react";
import { useAnnotationContext } from "./useAnnotationContext";
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
  const { selected } = useAnnotationContext();
  const currentDataValue = selected?.data as
    | fos.PolylineAnnotationLabel["data"]
    | null;

  // committed geometry read reactively from the engine (cf. Position3d) — a
  // 3D vertex edit commits there immediately, while a draft's `data` snapshot
  // is frozen at creation. Pre-commit drafts fall back to the snapshot.
  const engine = useAnnotationEngine();
  const sample = useSceneSampleId();
  const field = selected?.field ?? null;
  const labelId = (currentDataValue?._id as string | undefined) ?? "";
  const committed = useEngineSelector(engine, (e) =>
    labelId && field && sample
      ? (e.getLabel({ sample, path: field, instanceId: labelId }) as
          | fos.PolylineAnnotationLabel["data"]
          | undefined)
      : undefined,
  );

  const { segmentCount, vertexCount } = useMemo(() => {
    const source = committed ?? currentDataValue;
    const points = source?.points3d ?? source?.points;
    return {
      segmentCount: countSegments(points),
      vertexCount: countVertices(points),
    };
  }, [committed, currentDataValue]);

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
