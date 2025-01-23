import { Schema } from "@fiftyone/utilities";
import { Box, useColorScheme } from "@mui/material";
import { JsonViewer } from "@textea/json-viewer";
import { useAtomValue } from "jotai";
import React, { useLayoutEffect, useMemo, useState } from "react";
import "react-json-view-lite/dist/index.css";
import { v4 as uuid } from "uuid";
import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL } from "./constants";
import { useSpotlight } from "./hooks";
import type { LensSample } from "./models";
import { currentViewAtom, zoomLevelAtom } from "./state";

const SpotLightRenderer = ({
  samples,
  sampleSchema,
}: {
  samples: LensSample[];
  sampleSchema: Schema;
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

const JsonRenderer = ({ samples }: { samples: LensSample[] }) => {
  const { mode } = useColorScheme();

  const samplesWithClsRemoved = useMemo(() => {
    function removeClsFields(obj: any): any {
      if (typeof obj !== "object" || obj === null) {
        // base case: return primitives or null
        return obj;
      }

      if (Array.isArray(obj)) {
        // if it's an array, recursively process each element
        return obj.map(removeClsFields);
      }

      // if it's an object, create a new object without the '_cls' field
      const result: any = {};
      for (const key in obj) {
        if (key !== "_cls") {
          // recursively process nested objects
          result[key] = removeClsFields(obj[key]);
        }
      }

      return result;
    }

    return samples.map((sample) =>
      // note: consider not removing _cls altogether since deep traversal can be expensive...
      // for large number of samples or samples with deep labels
      // or, do so with a max-depth strategy
      removeClsFields(sample)
    );
  }, [samples]);

  // note 1: consider just using <pre>{JSON.stringify(samplesWithClsRemoved, null, 2)}</pre>
  // rendering is significantly faster that way, although we lose on syntax highlighting and
  // collapsible objects

  // note 2: it's intentional that we didn't use custom fo's custom JsonViewer, which adds
  // support for searching and filtering. This is because the added searching functionality
  // has a performance cost, and we want to keep the JSON viewer as fast as possible.
  return (
    <Box>
      <JsonViewer
        theme={mode === "dark" ? "dark" : "light"}
        rootName={false}
        // value of more than 2 expands labels, which is not desirable
        defaultInspectDepth={2}
        value={samplesWithClsRemoved as ReturnType<typeof JSON.parse>}
      />
    </Box>
  );
};

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
  sampleSchema: Schema;
}) => {
  const viewMode = useAtomValue(currentViewAtom);

  if (viewMode === "json") {
    return <JsonRenderer samples={samples} />;
  }

  return <SpotLightRenderer samples={samples} sampleSchema={sampleSchema} />;
};
