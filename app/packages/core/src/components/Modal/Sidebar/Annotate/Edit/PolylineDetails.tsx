import { polylinePointTransformsAtom } from "@fiftyone/looker-3d/src/state";
import { Box, Popover, Typography } from "@mui/material";
import { useAtomValue } from "jotai";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { currentData } from "./state";

// Simple fast hash function using djb2 algorithm
const hashPoints3d = (points3d: any): string => {
  if (!points3d || !Array.isArray(points3d)) return "";

  const str = JSON.stringify(points3d);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(16).substring(0, 8);
};

export const PolylineDetails = () => {
  const currentDataValue = useAtomValue(currentData);
  const polylinePointTransforms =
    useRecoilValue(polylinePointTransformsAtom) ?? {};
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const { segmentCount, vertexCount, pointsHash } = useMemo(() => {
    let segments = 0;
    let totalVertices = 0;
    let hash = "";

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
        hash = hashPoints3d(transformData.segments);
        return {
          segmentCount: segments,
          vertexCount: totalVertices,
          pointsHash: hash,
        };
      }
    }

    return { segmentCount: 0, vertexCount: 0, pointsHash: "" };
  }, [currentDataValue, polylinePointTransforms]);

  const handleHashHover = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleHashLeave = () => {
    setAnchorEl(null);
  };

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      <Typography
        variant="body2"
        sx={{
          fontFamily: "monospace",
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
                color: "primary.main",
                fontFamily: "inherit",
                fontSize: "inherit",
              }}
            >
              {segmentCount}
            </Box>
            <Box component="span" sx={{ ml: 0.5, color: "text.disabled" }}>
              segments
            </Box>
            <Box component="span" sx={{ mx: 0.5, color: "text.disabled" }}>
              •
            </Box>
          </>
        )}
        <Box
          component="span"
          sx={{
            fontWeight: 700,
            color: "primary.main",
            fontFamily: "inherit",
            fontSize: "inherit",
          }}
        >
          {vertexCount}
        </Box>
        <Box component="span" sx={{ ml: 0.5, color: "text.disabled" }}>
          vertices
        </Box>
      </Typography>

      {pointsHash && (
        <>
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              letterSpacing: "0.05em",
              color: "text.disabled",
              display: "block",
              mt: 0.5,
              textDecoration: "underline",
              textDecorationStyle: "dotted",
              cursor: "help",
            }}
            onMouseEnter={handleHashHover}
            onMouseLeave={handleHashLeave}
          >
            #{pointsHash}
          </Typography>

          <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onClose={handleHashLeave}
            anchorOrigin={{
              vertical: "top",
              horizontal: "center",
            }}
            transformOrigin={{
              vertical: "bottom",
              horizontal: "center",
            }}
            disableRestoreFocus
            sx={{
              pointerEvents: "none",
              zIndex: 9999,
            }}
          >
            <Box sx={{ p: 2, maxWidth: 280 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Points hash
              </Typography>
              <Typography
                variant="body2"
                sx={{ mb: 1, color: "text.secondary" }}
              >
                Debug hash of coordinate data. Useful for debugging polyline
                modifications and data integrity verification. For debugging
                purposes only.
              </Typography>
            </Box>
          </Popover>
        </>
      )}
    </Box>
  );
};
