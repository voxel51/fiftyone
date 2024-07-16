import {
  Box,
  BoxProps,
  Typography,
  useTheme,
  styled,
  IconButton,
  Paper,
  Grid,
} from "@mui/material";
import React, { useState, useEffect, useCallback } from "react";
import { Button, HeaderView } from ".";
import { getComponentProps, getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";
import GridLayout from "react-grid-layout";
import CloseIcon from "@mui/icons-material/Close";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";

const AddItemCTA = ({ onAdd }) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        width: "100%",
      }}
    >
      <Paper sx={{ padding: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Add an Item to Your Dashboard
        </Typography>
        <Button variant="contained" onClick={onAdd}>
          Add Item
        </Button>
      </Paper>
    </Box>
  );
};
const AddItemButton = ({ onAddItem }) => {
  return (
    <Grid container spacing={2} style={{ position: "fixed", bottom: 0 }}>
      <Grid item xs={12}>
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="100px"
          width="100%"
        >
          <Button variant="contained" size="large" onClick={onAddItem}>
            Add New Item
          </Button>
        </Box>
      </Grid>
    </Grid>
  );
};

export default function DashboardView(props: ViewPropsType) {
  const { schema, path, data, layout } = props;
  const { properties } = schema as ObjectSchemaType;
  const propertiesAsArray = [];
  const allow_addition = schema.view.allow_addition;
  const allow_deletion = schema.view.allow_deletion;

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }
  const panelId = usePanelId();
  const triggerPanelEvent = usePanelEvent();

  const onCloseItem = useCallback(
    ({ id, path }) => {
      if (schema.view.on_remove_item) {
        triggerPanelEvent(panelId, {
          operator: schema.view.on_remove_item,
          params: { id, path },
        });
      }
    },
    [panelId, props, schema.view.on_remove_item, triggerPanelEvent]
  );
  const onAddItem = useCallback(() => {
    if (schema.view.on_add_item) {
      triggerPanelEvent(panelId, {
        operator: schema.view.on_add_item,
      });
    }
  }, [panelId, props, schema.view.on_add_item, triggerPanelEvent]);
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

  if (!propertiesAsArray.length) {
    if (!allow_addition) {
      return null;
    }
    return <AddItemCTA onAdd={onAddItem} />;
  }
  const finalLayout = [
    ...gridLayout,
    { i: "add-item", x: 0, y: ROWS, w: COLS, h: 1, static: true },
  ];
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
          layout={finalLayout}
          cols={COLS}
          rowHeight={GRID_HEIGHT / ROWS} // Dynamic row height
          width={GRID_WIDTH}
          onDragStart={() => setIsDragging(true)}
          onDragStop={() => setIsDragging(false)}
          resizeHandles={["ne"]}
          isDraggable={!isDragging}
          isResizable={!isDragging} // Allow resizing
          draggableHandle=".drag-handle"
          resizeHandle={(axis, ref) => {
            return <ResizeHandle {...{ axis, ref }} />;
          }}
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
                  {allow_deletion && (
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
                  )}
                </DragHandle>
                <DynamicIO
                  {...props}
                  schema={property}
                  path={itemPath}
                  data={data?.[id]}
                  parentSchema={schema}
                  relativePath={id}
                />
              </Box>
            );
          })}
        </GridLayout>
      </Box>
      {allow_addition && <AddItemButton key="add-item" onAddItem={onAddItem} />}
    </Box>
  );
}
