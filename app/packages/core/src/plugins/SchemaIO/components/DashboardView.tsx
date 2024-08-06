import { useTheme } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  BoxProps,
  Grid,
  IconButton,
  Paper,
  styled,
  Typography,
} from "@mui/material";
import React, { forwardRef, useCallback, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Button, ButtonView } from ".";
import { getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";
import { Edit, Add } from "@mui/icons-material";

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
      <Paper
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          padding: 2,
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" gutterBottom>
            No items yet
          </Typography>
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2" sx={{ marginBottom: 2 }}>
            Add items to this dashboard to start exploring, plotting, and
            sharing.
          </Typography>
        </Box>
        <Box>
          <ButtonView
            onClick={onAdd}
            schema={{
              view: {
                variant: "contained",
                icon: "add",
                label: "Add Item",
              },
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};
const AddItemButton = ({ onAddItem }) => {
  return (
    <Box
      height="50px"
      width="100%"
      sx={{ padding: 1, overflow: "hidden" }}
      backgroundColor="background.default"
    >
      <ButtonView
        onClick={onAddItem}
        schema={{
          view: {
            icon: "add",
            label: "Add Item",
          },
        }}
      />
    </Box>
  );
};

export default function DashboardView(props: ViewPropsType) {
  const { schema, path, data, layout } = props;
  const { properties } = schema as ObjectSchemaType;
  const propertiesAsArray = [];
  const allow_addition = schema.view.allow_addition;
  const allow_deletion = schema.view.allow_deletion;
  const allow_edit = schema.view.allow_edit;

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }
  const panelId = usePanelId();
  const triggerPanelEvent = usePanelEvent();

  const onEditItem = useCallback(
    ({ id, path }) => {
      if (schema.view.on_edit_item) {
        triggerPanelEvent(panelId, {
          operator: schema.view.on_edit_item,
          params: { id, path },
        });
      }
    },
    [panelId, props, schema.view.on_edit_item, triggerPanelEvent]
  );
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
  const theme = useTheme();

  const MIN_ITEM_WIDTH = 400;
  const MIN_ITEM_HEIGHT = 300; // Setting minimum height for items
  const GRID_WIDTH = layout?.width; // Set based on your container's width
  const GRID_HEIGHT = layout?.height - 80; // panel height - footer height
  let COLS = GRID_WIDTH ? Math.floor(GRID_WIDTH / MIN_ITEM_WIDTH) || 1 : 1;
  let ROWS = Math.ceil(propertiesAsArray.length / COLS) || 1;

  if (propertiesAsArray.length === 1) {
    COLS = 1;
    ROWS = 1;
  }

  const viewLayout = schema.view.layout;
  const defaultLayout = propertiesAsArray.map((property, index) => {
    return {
      i: property.id,
      x: index % COLS,
      y: Math.floor(index / COLS),
      w: 1,
      h: 1,
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
    <Box>
      {allow_addition && <AddItemButton key="add-item" onAddItem={onAddItem} />}
      <GridLayout
        onLayoutChange={handleLayoutChange}
        layout={finalLayout}
        cols={COLS}
        rowHeight={GRID_HEIGHT / ROWS} // Dynamic row height
        width={GRID_WIDTH}
        resizeHandles={["e", "w", "n", "s"]}
        draggableHandle=".drag-handle"
        resizeHandle={(axis, ref) => {
          return <DashboardItemResizeHandle axis={axis} ref={ref} />;
        }}
      >
        {propertiesAsArray.map((property) => {
          const { id } = property;
          const value = data?.[id];
          const label = property.view?.layout?.title || value?.name || id;
          const itemPath = getPath(path, id);
          const baseItemProps: BoxProps = {
            sx: { padding: 0.25, position: "relative" },
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
                <Typography>{label}</Typography>
                <Box>
                  {allow_edit && (
                    <IconButton
                      size="small"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditItem({ id, path: getPath(path, id) });
                      }}
                      sx={{ color: theme.text.secondary }}
                    >
                      <Edit />
                    </IconButton>
                  )}
                  {allow_deletion && (
                    <IconButton
                      size="small"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseItem({ id, path: getPath(path, id) });
                      }}
                      sx={{ color: theme.text.secondary }}
                    >
                      <CloseIcon />
                    </IconButton>
                  )}
                </Box>
              </DragHandle>
              <Box sx={{ height: "calc(100% - 35px)", overflow: "auto" }}>
                <DynamicIO
                  {...props}
                  schema={property}
                  path={itemPath}
                  data={data?.[id]}
                  parentSchema={schema}
                  relativePath={id}
                />
              </Box>
            </Box>
          );
        })}
      </GridLayout>
    </Box>
  );
}

const DashboardItemResizeHandle = forwardRef((props, ref) => {
  const theme = useTheme();
  const { axis } = props;

  const axisSx = AXIS_SX[axis] || {};

  return (
    <Typography
      ref={ref}
      sx={{
        ...axisSx,
        position: "absolute",
        borderColor: theme.neutral.plainColor,
        opacity: 0,
        transition: "opacity 0.25s",
        "&:hover": {
          opacity: 1,
        },
      }}
      aria-label={`Resize ${axis}`}
      {...props}
    />
  );
});

const AXIS_SX = {
  e: {
    height: "100%",
    right: 0,
    top: 0,
    borderRight: "2px solid",
    cursor: "e-resize",
  },
  w: {
    height: "100%",
    left: 0,
    top: 0,
    borderLeft: "2px solid",
    cursor: "w-resize",
  },
  s: {
    width: "100%",
    bottom: 0,
    left: 0,
    borderBottom: "2px solid",
    cursor: "s-resize",
  },
  n: {
    width: "100%",
    top: 0,
    left: 0,
    borderTop: "2px solid",
    cursor: "n-resize",
  },
};
