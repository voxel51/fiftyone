import React, { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@fiftyone/components";
import DynamicIO from "./DynamicIO";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import { getPath, getProps } from "../utils";

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

  // Convert properties to array (same as DashboardView)
  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  // Use EXACTLY the same calculations as DashboardView
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

  // Sort properties by custom layout (same as DashboardView)
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

  // Create grid layout map (same as DashboardView)
  const gridLayoutById = gridLayout.reduce((layout, item) => {
    layout[item.i] = item;
    return layout;
  }, {});

  // Calculate total dimensions based on react-grid-layout logic
  const GRID_MARGIN = 8; // Same as DashboardView margin={[8, 8]}
  const CONTAINER_PADDING = 16;

  // Calculate total height like react-grid-layout does
  const totalHeight =
    CONTAINER_PADDING * 2 + ROWS * ROW_HEIGHT + (ROWS - 1) * GRID_MARGIN;
  const totalWidth = GRID_WIDTH;

  return (
    <Box
      ref={containerRef}
      sx={{
        width: totalWidth,
        height: totalHeight,
        backgroundColor: theme.background?.level1 || "#f5f5f5",
        padding: 16,
        position: "relative",
      }}
    >
      {orderedProperties.map((property) => {
        const { id } = property;
        const value = data?.[id];
        const label = property.view?.layout?.title || value?.name || id;
        const itemPath = getPath(path, id);
        const propertyIsPlotlyView = isPlotlyView(property);
        const propertyLayout = { ...gridLayoutById[id], COLS, ROWS };

        // Get the layout item for this property
        const layoutItem = gridLayoutById[id];
        if (!layoutItem) return null;

        // Calculate position exactly like react-grid-layout does
        const left = layoutItem.x * (GRID_WIDTH / COLS + GRID_MARGIN);
        const top = layoutItem.y * (ROW_HEIGHT + GRID_MARGIN);
        const width = layoutItem.w * (GRID_WIDTH / COLS) - GRID_MARGIN;
        const height = layoutItem.h * ROW_HEIGHT - GRID_MARGIN;

        return (
          <Box
            key={id}
            sx={{
              position: "absolute",
              left,
              top,
              width,
              height,
              border: "2px solid transparent",
              borderRadius: "0px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Drag Handle (simplified for PNG) */}
            <Box
              sx={{
                height: "35px",
                backgroundColor: theme.background?.header || "#ffffff",
                color: theme.text?.secondary || "#666",
                padding: "4px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: `1px solid ${theme.divider || "#e0e0e0"}`,
              }}
            >
              <Typography
                sx={{
                  marginLeft: 3,
                  fontSize: "16px",
                  color: theme.text?.secondary || "#666",
                }}
              >
                {label}
              </Typography>
            </Box>

            {/* Plot Content - same height calculation as DashboardView */}
            <Box
              sx={{
                height: "calc(100% - 35px)",
                overflow: propertyIsPlotlyView ? "hidden" : "auto",
                flex: 1,
              }}
            >
              <DynamicIO
                schema={property}
                path={itemPath}
                data={data?.[id]}
                parentSchema={schema}
                relativePath={id}
                relativeLayout={propertyLayout}
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

function isPlotlyView(schema) {
  return schema?.view?.name === "PlotlyView";
}
