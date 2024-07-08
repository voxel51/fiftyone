import {
  Box,
  BoxProps,
  Typography,
  useTheme,
  styled,
  IconButton,
} from "@mui/material";
import React, { useState, useEffect, useCallback } from "react";
import { HeaderView } from ".";
import { getComponentProps, getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";
import GridLayout from "react-grid-layout";
import CloseIcon from "@mui/icons-material/Close";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";

export default function DashboardView(props: ViewPropsType) {
  const { schema, path, data, layout } = props;
  const { properties } = schema as ObjectSchemaType;
  const propertiesAsArray = [];

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }
  const panelId = usePanelId();
  const triggerPanelEvent = usePanelEvent();

  const onCloseItem = useCallback(
    ({ id, path }) => {
      if (schema.view.on_close_item) {
        triggerPanelEvent(panelId, {
          operator: schema.view.on_close_item,
          params: { id, path },
        });
      }
    },
    [panelId, props, schema.view.on_close_item, triggerPanelEvent]
  );
  const handleLayoutChange = useCallback(
    (layout: any) => {
      if (schema.view.on_layout_change) {
        triggerPanelEvent(panelId, {
          operator: schema.view.on_layout_change,
          params: { layout },
        });
      }
    },
    [panelId, props, schema.view.on_layout_change, triggerPanelEvent]
  );
  const [isDragging, setIsDragging] = useState(false);
  const theme = useTheme();

  const baseGridProps: BoxProps = {};
  const MIN_ITEM_WIDTH = 400;
  const MIN_ITEM_HEIGHT = 300; // Setting minimum height for items
  const GRID_WIDTH = layout?.width; // Set based on your container's width
  const GRID_HEIGHT = layout?.height - 180; // Set based on your container's height - TODO remove button height hardcoded
  const COLS = Math.floor(GRID_WIDTH / MIN_ITEM_WIDTH);
  const ROWS = Math.ceil(propertiesAsArray.length / COLS);

  const viewLayout = schema.view.layout;
  const defaultLayout = propertiesAsArray.map((property, index) => {
    return {
      i: property.id,
      x: index % COLS, // Correctly position items in the grid
      y: Math.floor(index / COLS), // Correctly position items in the grid
      w: 1,
      h: 1, // Each item takes one row
      minW: 1, // Minimum width in grid units
      minH: Math.ceil(MIN_ITEM_HEIGHT / (GRID_HEIGHT / ROWS)), // Minimum height in grid units
    };
  });
  const gridLayout = viewLayout || defaultLayout;

  const DragHandle = styled(Box)(({ theme }) => ({
    cursor: "move",
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.secondary,
    padding: theme.spacing(0.25),
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }));

  const ResizeHandle = styled("span")(({ theme }) => ({
    position: "absolute",
    width: 20,
    height: 20,
    bottom: 0,
    right: 0,
    backgroundColor: theme.palette.secondary.main,
    borderRadius: "50%",
    cursor: "se-resize",
  }));

  console.log("viewLayout", viewLayout);
  console.log("propertiesAsArray", propertiesAsArray);

  return (
    <Box
      {...getComponentProps(props, "container")}
      sx={{ position: "relative", marginLeft: -0.5 }}
    >
      <Box
        {...getProps(props, "grid", baseGridProps)}
        sx={{ position: "relative" }}
      >
        <GridLayout
          onLayoutChange={handleLayoutChange}
          layout={gridLayout}
          cols={COLS}
          rowHeight={GRID_HEIGHT / ROWS} // Dynamic row height
          width={GRID_WIDTH}
          onDragStart={() => setIsDragging(true)}
          onDragStop={() => setIsDragging(false)}
          isDraggable={!isDragging}
          isResizable={!isDragging} // Allow resizing
          draggableHandle=".drag-handle" // Specify the drag handle class
        >
          {propertiesAsArray.map((property) => {
            const { id } = property;
            const itemPath = getPath(path, id);
            const baseItemProps: BoxProps = {
              sx: { padding: 0.25, position: "relative" },
              key: id,
            };
            return (
              <Box
                key={id}
                {...getProps(
                  { ...props, schema: property },
                  "item",
                  baseItemProps
                )}
              >
                <DragHandle className="drag-handle">
                  <Typography>{property.title || id}</Typography>
                  <IconButton
                    size="small"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseItem({ id, path: getPath(path, id) });
                    }}
                    sx={{ color: theme.palette.text.secondary }}
                  >
                    <CloseIcon />
                  </IconButton>
                </DragHandle>
                <DynamicIO
                  {...props}
                  schema={property}
                  path={itemPath}
                  data={data?.[id]}
                  parentSchema={schema}
                  relativePath={id}
                />
                <ResizeHandle className="react-resizable-handle" />
              </Box>
            );
          })}
        </GridLayout>
      </Box>
    </Box>
  );
}
