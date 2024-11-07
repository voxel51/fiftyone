import { useLayoutEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { Box, Slider, Typography } from "@mui/material";
import { useSpotlight } from "./hooks";
import type { LensSample } from "./models";

/**
 * Minimum zoom level for rendered samples.
 */
const minZoomLevel = 1;

/**
 * Maximum zoom level for rendered samples.
 */
const maxZoomLevel = 11;

/**
 * Component which handles rendering samples.
 *
 * This component makes use of the Spotlight and Looker components, which
 * do the heavy lifting of actually rendering the samples.
 */
export const Lens = ({
  samples,
  sampleSchema,
}: {
  samples: LensSample[];
  sampleSchema: object;
}) => {
  const elementId = useMemo(() => uuid(), []);

  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(
    Math.floor((minZoomLevel + maxZoomLevel) / 2)
  );

  const spotlight = useSpotlight({
    samples,
    sampleSchema,
    resizing,
    minZoomLevel,
    maxZoomLevel,
    zoom,
  });

  // Attach spotlight to this component's root element
  useLayoutEffect(() => {
    if (!spotlight || resizing) {
      return;
    }

    const element = document.getElementById(elementId);
    if (element) {
      spotlight.attach(element);
    }

    return () => {
      spotlight.destroy();
    };
  }, [elementId, spotlight, resizing]);

  // Register resize observer to trigger re-render
  useLayoutEffect(() => {
    const el = () => document.getElementById(elementId)?.parentElement;
    const observer = new ResizeObserver(() => {
      setResizing(true);
      setTimeout(() => setResizing(false), 100);
    });

    const element = el();
    element && observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [elementId]);

  return (
    <Box>
      {/*Controls*/}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Box sx={{ flex: "0 1 200px", mb: 2 }}>
          <Typography color="secondary" gutterBottom>
            Zoom level
          </Typography>
          <Slider
            value={zoom}
            onChange={(_, val) => setZoom(val instanceof Array ? val[0] : val)}
            min={minZoomLevel}
            max={maxZoomLevel}
            step={1}
            color="primary"
          />
        </Box>
      </Box>

      {/*Spotlight container*/}
      <Box
        sx={{
          width: "100%",
          height: "800px",
        }}
      >
        {/*Spotlight*/}
        <Box id={elementId} sx={{ width: "100%", height: "100%" }}></Box>
      </Box>
    </Box>
  );
};
