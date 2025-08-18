import React, { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@fiftyone/components";
import DynamicIO from "./DynamicIO";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import { getPath } from "../utils";

interface DashboardPNGExportProps {
  schema: ObjectSchemaType;
  data: any;
  path: string;
  layout?: { width: number; height: number };
  autoLayout?: boolean;
  layoutMode?: string;
  numRows?: number;
  numCols?: number;
  customLayout?: any[];
}

export default function DashboardPNGExport({
  schema,
  data,
  path,
  layout,
  autoLayout = true,
  layoutMode = "columns",
  numRows = 1,
  numCols = 1,
  customLayout = [],
}: DashboardPNGExportProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const { properties } = schema;
  const propertiesAsArray = [];

  // Convert properties to array
  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  // Calculate layout dimensions (same logic as DashboardView)
  const NUM_ITEMS = propertiesAsArray.length;
  const MIN_ITEM_WIDTH = 400;
  const MIN_ITEM_HEIGHT = 300;
  const ASPECT_RATIO = 4 / 3; // width / height
  const HEIGHT_FACTOR = 1 / ASPECT_RATIO;
  const GRID_WIDTH = layout?.width || 1280;
  const GRID_HEIGHT = (layout?.height || 800) - 80; // panel height - footer height
  const TARGET_ITEM_WIDTH = Math.max(MIN_ITEM_WIDTH, GRID_WIDTH / NUM_ITEMS);
  const TARGET_ITEM_HEIGHT = HEIGHT_FACTOR * TARGET_ITEM_WIDTH;

  let COLS = autoLayout
    ? Math.floor(GRID_WIDTH / TARGET_ITEM_WIDTH) || 1
    : layoutMode === "columns"
    ? numCols
    : Math.ceil(NUM_ITEMS / numRows);
  let ROWS = autoLayout
    ? Math.ceil(NUM_ITEMS / COLS) || 1
    : layoutMode === "rows"
    ? numRows
    : Math.ceil(NUM_ITEMS / numCols);
  const ROW_HEIGHT = Math.min(GRID_HEIGHT, TARGET_ITEM_HEIGHT);

  if (propertiesAsArray.length === 1) {
    COLS = 1;
    ROWS = 1;
  }

  // Sort properties by custom layout (same logic as DashboardView)
  const orderedProperties = sortPropertiesByCustomLayout(
    propertiesAsArray,
    customLayout
  );

  const defaultLayout = orderedProperties.map((property, index) => {
    return {
      i: property.id,
      x: index % COLS,
      y: Math.floor(index / COLS),
      w: 1,
      h: 1,
      minW: 1,
      minH: Math.ceil(MIN_ITEM_HEIGHT / (GRID_HEIGHT / ROWS)),
    };
  });
  const gridLayout = customLayout.length > 0 ? customLayout : defaultLayout;

  // Calculate grid dimensions
  const ITEM_WIDTH = GRID_WIDTH / COLS;
  const ITEM_HEIGHT = ROW_HEIGHT;
  const HEADER_HEIGHT = 40;
  const PLOT_MARGIN = 10;
  const CONTAINER_PADDING = 20;

  const totalHeight =
    CONTAINER_PADDING * 2 + ROWS * (ITEM_HEIGHT + PLOT_MARGIN) - PLOT_MARGIN;
  const totalWidth = GRID_WIDTH;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: totalWidth,
        height: totalHeight,
        backgroundColor:
          theme.background?.level0 ||
          theme.palette?.background?.default ||
          "#2a2a2a",
        padding: CONTAINER_PADDING,
        position: "relative",
      }}
    >
      {gridLayout.map((layoutItem) => {
        const property = propertiesAsArray.find((p) => p.id === layoutItem.i);
        if (!property) return null;

        const { id } = property;
        const value = data?.[id];
        const label = property.view?.layout?.title || value?.name || id;
        const itemPath = getPath(path, id);

        // Calculate position based on grid layout
        const left = layoutItem.x * ITEM_WIDTH;
        const top = layoutItem.y * (ITEM_HEIGHT + PLOT_MARGIN);

        return (
          <Box
            key={id}
            sx={{
              position: "absolute",
              left,
              top,
              width: layoutItem.w * ITEM_WIDTH - PLOT_MARGIN,
              height: layoutItem.h * ITEM_HEIGHT + HEADER_HEIGHT,
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${
                theme.divider || theme.palette?.divider || "#e0e0e0"
              }`,
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            {/* Plot Title */}
            <Box
              sx={{
                height: HEADER_HEIGHT,
                padding: "8px 16px",
                backgroundColor:
                  theme.background?.level1 ||
                  theme.palette?.background?.default ||
                  "#f5f5f5",
                borderBottom: `1px solid ${
                  theme.divider || theme.palette?.divider || "#e0e0e0"
                }`,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 500,
                  color:
                    theme.text?.primary ||
                    theme.palette?.text?.primary ||
                    "#000000",
                }}
              >
                {label}
              </Typography>
            </Box>

            {/* Plot Content */}
            <Box
              sx={{
                width: "100%",
                height: layoutItem.h * ITEM_HEIGHT,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <DynamicIO
                schema={property}
                path={itemPath}
                data={data?.[id]}
                parentSchema={schema}
                relativePath={id}
                errors={{}}
                onChange={() => {}}
                otherProps={{}}
              />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function sortPropertiesByCustomLayout(properties, customLayout) {
  const customLayoutMap = customLayout.reduce((acc, item) => {
    acc[item.i] = item;
    return acc;
  }, {});

  return properties.sort((a, b) => {
    const aIndex = customLayoutMap[a.id]?.y * 100 + customLayoutMap[a.id]?.x;
    const bIndex = customLayoutMap[b.id]?.y * 100 + customLayoutMap[b.id]?.x;
    return aIndex - bIndex;
  });
}
