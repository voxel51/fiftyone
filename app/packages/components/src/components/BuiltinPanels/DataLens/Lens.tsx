import { Box } from "@mui/material";
import { useAtomValue } from "jotai";
import React, { useLayoutEffect, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL } from "./constants";
import { useSpotlight } from "./hooks";
import type { LensSample } from "./models";
import { zoomLevelAtom } from "./state";

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
  const zoom = useAtomValue(zoomLevelAtom);

  const spotlight = useSpotlight({
    samples,
    sampleSchema,
    resizing,
    minZoomLevel: MIN_ZOOM_LEVEL,
    maxZoomLevel: MAX_ZOOM_LEVEL,
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
