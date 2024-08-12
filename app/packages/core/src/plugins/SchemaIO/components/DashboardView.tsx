import { useTheme } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId } from "@fiftyone/spaces";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import {
  Alert,
  Box,
  BoxProps,
  Checkbox,
  Fab,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Paper,
  Popover,
  Radio,
  RadioGroup,
  styled,
  TextField,
  Typography,
} from "@mui/material";
import React, { forwardRef, useCallback, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ButtonView } from ".";
import { getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";

const AddItemCTA = ({ onAdd, view }) => {
  const header = view?.cta_title || "No items yet";
  const body =
    view?.cta_body ||
    "Add items to this dashboard to start exploring, plotting, and sharing.";
  const cta_button_label = view?.cta_button_label || "Add Item";
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
            {header}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2" sx={{ marginBottom: 2 }}>
            {body}
          </Typography>
        </Box>
        <Box>
          <ButtonView
            onClick={onAdd}
            schema={{
              view: {
                variant: "contained",
                icon: "add",
                label: cta_button_label,
              },
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

const LayoutPopover = ({
  anchorEl,
  handleClose,
  autoLayout,
  onAutoLayoutChange,
  layoutMode,
  onLayoutModeChange,
  numRows,
  onNumRowsChange,
  numCols,
  onNumColsChange,
  isEditMode,
}) => {
  const open = Boolean(anchorEl);
  const id = open ? "simple-popover" : undefined;
  const theme = useTheme();

  return (
    <Popover
      id={id}
      open={open}
      anchorEl={anchorEl}
      onClose={handleClose}
      anchorOrigin={{
        vertical: "bottom",
        horizontal: "left",
      }}
    >
      <Box
        sx={{
          padding: 2,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          backgroundColor: (theme) => theme.palette.background.default,
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={autoLayout}
              onChange={onAutoLayoutChange}
              name="autoLayout"
              color="primary"
            />
          }
          label="Auto Layout"
        />
        {isEditMode && !autoLayout && (
          <>
            <FormControl component="fieldset" sx={{ marginBottom: 2 }}>
              <FormLabel component="legend">Layout Mode</FormLabel>
              <RadioGroup
                row
                aria-label="layout-mode"
                name="layout-mode"
                value={layoutMode}
                onChange={onLayoutModeChange}
              >
                <FormControlLabel
                  value="columns"
                  control={<Radio />}
                  label="Columns"
                />
                <FormControlLabel
                  value="rows"
                  control={<Radio />}
                  label="Rows"
                />
              </RadioGroup>
            </FormControl>
            {layoutMode === "rows" && (
              <TextField
                label="Rows"
                type="number"
                value={numRows}
                onChange={onNumRowsChange}
                inputProps={{ min: 1, max: 100 }}
                sx={{ width: 80, marginBottom: 2 }}
              />
            )}
            {layoutMode === "columns" && (
              <TextField
                label="Columns"
                type="number"
                value={numCols}
                onChange={onNumColsChange}
                inputProps={{ min: 1, max: 100 }}
                sx={{ width: 80, marginBottom: 2 }}
              />
            )}
          </>
        )}
      </Box>
    </Popover>
  );
};

const ControlContainer = ({
  onAddItem,
  onEditLayoutClick,
  isEditMode,
  autoLayout,
  editLayoutOpen,
}) => {
  if (!isEditMode) {
    return null;
  }
  return (
    <Box
      height="50px"
      width="100%"
      sx={{
        display: "flex",
        alignItems: "center",
        padding: 1,
        gap: 2,
        backgroundColor: "background.default",
      }}
    >
      <ButtonView
        onClick={onAddItem}
        schema={{
          view: {
            icon: "add",
            label: "Add item",
          },
        }}
      />
      <ButtonView
        onClick={onEditLayoutClick}
        schema={{
          view: {
            icon: "edit",
            label: "Edit layout",
          },
        }}
      />
      {editLayoutOpen && (
        <Alert severity="info">
          {autoLayout && (
            <Typography>
              You can customize the layout of the items in this dashboard by
              dragging to re-order.
            </Typography>
          )}
          {!autoLayout && (
            <Typography>
              You can customize the layout of the items in this dashboard by
              resizing them and dragging to re-order.
            </Typography>
          )}
        </Alert>
      )}
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
  const allowMutation = allow_edit || allow_deletion;

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

  const auto_layout_default = schema.view.auto_layout === false ? false : true;
  const [autoLayout, setAutoLayout] = useState(auto_layout_default);
  const [numRows, setNumRows] = useState(schema.view.rows || 1);
  const [numCols, setNumCols] = useState(schema.view.cols || 1);
  const [layoutMode, setLayoutMode] = useState("columns");
  const [anchorEl, setAnchorEl] = useState(null);
  const [customLayout, setCustomLayout] = useState(schema.view.items || []);
  const [isEditMode, setIsEditMode] = useState(false);

  const handleAutoLayoutChange = (event) => {
    const { checked } = event.target;
    setAutoLayout(checked);
    triggerPanelEvent(panelId, {
      operator: schema.view.on_auto_layout_change,
      params: { auto_layout: checked },
    });
  };

  const handleNumRowsChange = (event) => {
    const { value } = event.target;
    const newValue = Math.max(1, Math.min(value, propertiesAsArray.length));
    setNumRows(value);
  };

  const handleNumColsChange = (event) => {
    const { value } = event.target;
    const newValue = Math.max(1, Math.min(value, propertiesAsArray.length));
    setNumCols(newValue);
  };

  const handleLayoutModeChange = (event) => {
    const { value } = event.target;
    setLayoutMode(value);
    if (value === "rows") {
      setNumCols(1);
    } else {
      setNumRows(1);
    }
  };

  const handleSaveLayout = () => {
    if (schema.view.on_save_layout) {
      triggerPanelEvent(panelId, {
        operator: schema.view.on_save_layout,
        params: {
          items: customLayout,
          rows: numRows,
          cols: numCols,
          auto_layout: autoLayout,
        },
      });
    }
  };

  const handleEditLayoutClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const toggleEditMode = () => {
    if (isEditMode) {
      handleSaveLayout();
    }
    setIsEditMode(!isEditMode);
  };

  const theme = useTheme();

  const NUM_ITEMS = propertiesAsArray.length;
  const MIN_ITEM_WIDTH = 400;
  const MIN_ITEM_HEIGHT = 300;
  const ASPECT_RATIO = 4 / 3; // width / height
  const HEIGHT_FACTOR = 1 / ASPECT_RATIO;
  const GRID_WIDTH = layout?.width;
  const GRID_HEIGHT = layout?.height - 80; // panel height - footer height
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
      minW: 1, // Minimum width in grid units
      minH: Math.ceil(MIN_ITEM_HEIGHT / (GRID_HEIGHT / ROWS)), // Minimum height in grid units
    };
  });
  const gridLayout = customLayout || defaultLayout;

  const DragHandle = styled(Box)(({ theme }) => ({
    cursor: "move",
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.secondary,
    padding: theme.spacing(0.25),
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  }));

  const gridLayoutById = useMemo(() => {
    return gridLayout.reduce((layout, item) => {
      layout[item.i] = item;
      return layout;
    }, {});
  }, [gridLayout]);

  if (!propertiesAsArray.length) {
    if (!allow_addition) {
      return null;
    }
    return <AddItemCTA onAdd={onAddItem} view={schema.view} />;
  }

  return (
    <>
      <Box
        sx={{ height: layout?.height, overflowY: "auto", overflowX: "hidden" }}
      >
        <ControlContainer
          onAddItem={onAddItem}
          onEditLayoutClick={handleEditLayoutClick}
          isEditMode={isEditMode}
          autoLayout={autoLayout}
          editLayoutOpen={Boolean(anchorEl)}
        />
        <LayoutPopover
          anchorEl={anchorEl}
          handleClose={handleClosePopover}
          autoLayout={autoLayout}
          onAutoLayoutChange={handleAutoLayoutChange}
          layoutMode={layoutMode}
          onLayoutModeChange={handleLayoutModeChange}
          numRows={numRows}
          onNumRowsChange={handleNumRowsChange}
          numCols={numCols}
          onNumColsChange={handleNumColsChange}
          onSaveLayout={handleSaveLayout}
          isEditMode={isEditMode}
        />
        <GridLayout
          onLayoutChange={(layout) => {
            setCustomLayout(layout);
          }}
          layout={gridLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT} // Dynamic row height
          width={GRID_WIDTH}
          resizeHandles={autoLayout || !isEditMode ? [] : ["e", "w", "n", "s"]}
          draggableHandle=".drag-handle"
          isDraggable={isEditMode}
          isResizable={isEditMode}
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
            const propertyIsPlotlyView = isPlotlyView(property);
            const propertyLayout = { ...gridLayoutById[id], COLS, ROWS };

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
                  {isEditMode && (
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
                          <EditIcon />
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
                  )}
                </DragHandle>
                <Box
                  sx={{
                    height: "calc(100% - 35px)",
                    overflow: propertyIsPlotlyView ? "hidden" : "auto",
                  }}
                >
                  <DynamicIO
                    {...props}
                    schema={property}
                    path={itemPath}
                    data={data?.[id]}
                    parentSchema={schema}
                    relativePath={id}
                    relativeLayout={propertyLayout}
                  />
                </Box>
              </Box>
            );
          })}
        </GridLayout>
      </Box>
      {allowMutation && (
        <Fab
          color={isEditMode ? "primary" : "secondary"}
          aria-label="edit"
          size="small"
          onClick={toggleEditMode}
          sx={{ position: "absolute", bottom: 16, right: 16 }}
        >
          {isEditMode ? <CheckIcon /> : <EditIcon />}
        </Fab>
      )}
    </>
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
    cursor: "ew-resize",
    pl: 1,
  },
  w: {
    height: "100%",
    left: 0,
    top: 0,
    borderLeft: "2px solid",
    cursor: "ew-resize",
    pr: 1,
  },
  s: {
    width: "100%",
    bottom: 0,
    left: 0,
    borderBottom: "2px solid",
    cursor: "ns-resize",
    pt: 1,
  },
  n: {
    width: "100%",
    top: 0,
    left: 0,
    borderTop: "2px solid",
    cursor: "ns-resize",
    pb: 1,
  },
};

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
