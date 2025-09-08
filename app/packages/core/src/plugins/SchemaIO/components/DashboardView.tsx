import React, { useEffect } from "react";
import { useTheme } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId, usePanelState } from "@fiftyone/spaces";
import useNotification from "@fiftyone/state/src/hooks/useNotification";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import {
  Alert,
  Box,
  BoxProps,
  Button,
  Checkbox,
  Fab,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Radio,
  RadioGroup,
  styled,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ButtonView } from ".";
import { getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";
import DashboardPNGExport from "./DashboardPNGExport";
import { get as getFromPath } from "lodash";
import "./DashboardResizeHandles.css";

// Helper function to create minimal ButtonView props
const createButtonViewProps = (schema, onClick) => ({
  schema,
  path: "",
  errors: {},
  onChange: () => {},
  relativePath: "",
  otherProps: {},
  onClick,
});

// Helper function to generate unique copy IDs to avoid collisions
function generateUniqueCopyId(
  baseId: string,
  state: any,
  dataPath: string
): string {
  const existing = new Set(Object.keys(getFromPath(state, dataPath) || {}));
  let suffix = 1;
  let candidate = `${baseId}-copy`;
  while (existing.has(candidate)) {
    candidate = `${baseId}-copy-${suffix++}`;
  }
  return candidate;
}

// Helper function to detect platform for keyboard shortcuts
function getPlatformShortcutKey(): string {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  return isMac ? "⌘ + V" : "Ctrl + V";
}

// Shared layout calculation utility
function calculateLayoutDimensions(
  numItems: number,
  layout: any,
  autoLayout: boolean,
  layoutMode: string,
  numRows: number,
  numCols: number
) {
  const MIN_ITEM_WIDTH = 400;
  const MIN_ITEM_HEIGHT = 300;
  const ASPECT_RATIO = 4 / 3; // width / height
  const HEIGHT_FACTOR = 1 / ASPECT_RATIO;
  const GRID_WIDTH = layout?.width;
  const GRID_HEIGHT = layout?.height - 80; // panel height - footer height
  const TARGET_ITEM_WIDTH = Math.max(MIN_ITEM_WIDTH, GRID_WIDTH / numItems);
  const TARGET_ITEM_HEIGHT = HEIGHT_FACTOR * TARGET_ITEM_WIDTH;

  let COLS = autoLayout
    ? Math.floor(GRID_WIDTH / TARGET_ITEM_WIDTH) || 1
    : layoutMode === "columns"
    ? numCols
    : Math.ceil(numItems / numRows);
  let ROWS = autoLayout
    ? Math.ceil(numItems / COLS) || 1
    : layoutMode === "rows"
    ? numRows
    : Math.ceil(numItems / numCols);
  const ROW_HEIGHT = Math.min(GRID_HEIGHT, TARGET_ITEM_HEIGHT);

  if (numItems === 1) {
    COLS = 1;
    ROWS = 1;
  }

  return {
    COLS,
    ROWS,
    ROW_HEIGHT,
    MIN_ITEM_HEIGHT,
    GRID_HEIGHT,
    GRID_WIDTH,
  };
}

function useClipboardData() {
  const [hasClipboardData, setHasClipboardData] = useState(false);
  const [clipboardPermissionError, setClipboardPermissionError] =
    useState(false);

  const checkClipboard = useCallback(async () => {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        setClipboardPermissionError(true);
        setHasClipboardData(false);
        return;
      }

      const text = await navigator.clipboard.readText();
      const item = JSON.parse(text);

      // Check if it's a valid dashboard data structure
      if (
        typeof item === "object" &&
        item !== null &&
        item.plots &&
        Array.isArray(item.plots)
      ) {
        setHasClipboardData(true);
        setClipboardPermissionError(false);
      } else {
        setHasClipboardData(false);
        setClipboardPermissionError(false);
      }
    } catch (error) {
      setHasClipboardData(false);

      // Check if it's a permission error
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        setClipboardPermissionError(true);
      } else {
        setClipboardPermissionError(false);
      }
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkClipboard();

    // Listen for clipboard changes
    const handleClipboardChange = () => {
      checkClipboard();
    };

    // Check clipboard when window gains focus (user might have copied something)
    const handleFocus = () => {
      checkClipboard();
    };

    // Add event listeners
    if ("clipboard" in navigator && "addEventListener" in navigator.clipboard) {
      navigator.clipboard.addEventListener(
        "clipboardchange",
        handleClipboardChange
      );
    }
    window.addEventListener("focus", handleFocus);

    return () => {
      if (
        "clipboard" in navigator &&
        "removeEventListener" in navigator.clipboard
      ) {
        navigator.clipboard.removeEventListener(
          "clipboardchange",
          handleClipboardChange
        );
      }
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkClipboard]);

  return {
    hasClipboardData,
    setHasClipboardData,
    clipboardPermissionError,
    setClipboardPermissionError,
    triggerCheck: checkClipboard,
  };
}

const AddItemCTA = ({ onAdd, onPaste, view, clipboardData, schema }) => {
  const header = view?.cta_title || "No items yet";
  const body =
    view?.cta_body ||
    "Add items to this dashboard to start exploring, plotting, and sharing.";
  const cta_button_label = view?.cta_button_label || "Add Item";
  const paste_button_label = view?.paste_button_label || "Paste Plot";

  const { hasClipboardData, clipboardPermissionError } = clipboardData;

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
        <Box sx={{ display: "flex", gap: 1, flexDirection: "column" }}>
          <ButtonView
            {...createButtonViewProps(
              {
                type: "object",
                view: {
                  variant: "contained",
                  icon: "add",
                  label: cta_button_label,
                },
              },
              onAdd
            )}
          />
          {onPaste && hasClipboardData && schema.view.on_duplicate_item && (
            <ButtonView
              {...createButtonViewProps(
                {
                  type: "object",
                  view: {
                    variant: "square",
                    icon: "content_paste",
                    label: paste_button_label,
                  },
                },
                onPaste
              )}
            />
          )}
        </Box>
        {clipboardPermissionError && (
          <Alert severity="warning" sx={{ mt: 2, maxWidth: 400 }}>
            <Typography variant="body2">
              Clipboard access is restricted. To enable paste functionality,
              please allow clipboard permissions in your browser settings.
            </Typography>
          </Alert>
        )}
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
      sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
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
          label="Auto layout"
        />
        {isEditMode && !autoLayout && (
          <>
            <FormControl component="fieldset" sx={{ marginBottom: 2 }}>
              <FormLabel component="legend">Layout mode</FormLabel>
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
  onPasteClick,
  onSelectAll,
  onDeleteSelected,
  onExportItems,
  onExportAsPNG,
  handleExportMenuOpen,
  handleExportMenuClose,
  exportMenuAnchor,
  isEditMode,
  autoLayout,
  editLayoutOpen,
  shortcutKey,
  selectedItemIds,
  clipboardData,
  hasMultipleItems,
  schema,
}) => {
  const { hasClipboardData, clipboardPermissionError } = clipboardData;
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
        {...createButtonViewProps(
          {
            type: "object",
            view: {
              icon: "add",
              label: "Add item",
              variant: "square",
            },
          },
          onAddItem
        )}
      />
      <ButtonView
        {...createButtonViewProps(
          {
            type: "object",
            view: {
              icon: "edit",
              label: "Layout",
              variant: "square",
            },
          },
          onEditLayoutClick
        )}
      />
      {hasClipboardData &&
        !clipboardPermissionError &&
        schema.view.on_duplicate_item && (
          <ButtonView
            {...createButtonViewProps(
              {
                type: "object",
                view: {
                  icon: "content_paste",
                  label: `Paste`,
                  variant: "square",
                },
              },
              onPasteClick
            )}
          />
        )}
      {clipboardPermissionError && (
        <ButtonView
          {...createButtonViewProps(
            {
              type: "object",
              view: {
                icon: "content_paste",
                label: `Paste`,
                variant: "square",
                disabled: true,
                title:
                  "Clipboard access denied. Please allow clipboard permissions in your browser settings.",
              },
            },
            () => {} // Disabled click handler
          )}
        />
      )}
      {hasMultipleItems && (
        <ButtonView
          {...createButtonViewProps(
            {
              type: "object",
              view: {
                icon: "select_all",
                label: "Select all",
                variant: "square",
              },
            },
            onSelectAll
          )}
        />
      )}
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <ButtonView
          {...createButtonViewProps(
            {
              type: "object",
              view: {
                icon: "download",
                label: "Export",
                variant: "square",
              },
            },
            handleExportMenuOpen
          )}
        />
      </Box>
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportMenuClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <MenuItem
          onClick={() => {
            onExportItems();
            handleExportMenuClose();
          }}
        >
          Export as JSON
        </MenuItem>
        <MenuItem
          onClick={() => {
            onExportAsPNG();
            handleExportMenuClose();
          }}
        >
          Export as PNG
        </MenuItem>
      </Menu>

      {editLayoutOpen && selectedItemIds.size === 0 && (
        <Alert severity="info">
          {autoLayout && (
            <Typography>
              You can customize the layout of the items in this dashboard by
              dragging to re-order
            </Typography>
          )}
          {!autoLayout && (
            <Typography>
              You can customize the layout of the items in this dashboard by
              resizing them and dragging to re-order
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
  const dataPath = schema.view.data_path || "items_config";
  const [panelState, setPanelState] = usePanelState();

  // Shared clipboard state
  const clipboardData = useClipboardData();
  const { clipboardPermissionError } = clipboardData;

  // Notification hook for user feedback
  const showNotification = useNotification();

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const panelId = usePanelId();
  const triggerPanelEvent = usePanelEvent();

  // Selection state - now supports multiple items
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set()
  );

  const onEditItem = useCallback(
    ({ id, path }) => {
      if (schema.view.on_edit_item) {
        triggerPanelEvent(panelId, {
          panelId,
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
          panelId,
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
        panelId,
        operator: schema.view.on_add_item,
        params: {},
      });
    }
  }, [panelId, props, schema.view.on_add_item, triggerPanelEvent]);

  const safeParseJSON = (jsonString: string) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return null;
    }
  };

  const onExportItems = useCallback(() => {
    try {
      // Create the export data structure
      const exportData = {
        panelState,
        metadata: {
          exportDate: new Date().toISOString(),
          dataPath: dataPath,
        },
      };

      // Convert to JSON string
      const jsonString = JSON.stringify(exportData, null, 2);

      // Create blob and download
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;
      link.download = `dashboard-export-${
        new Date().toISOString().split("T")[0]
      }.json`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting dashboard items:", error);
    }
  }, [panelState, dataPath]);

  // Unified paste handler that works in both edit mode and when dashboard is empty
  const handlePaste = useCallback(async () => {
    // Check if duplicate operator is available
    if (!schema.view.on_duplicate_item) {
      return;
    }

    setIsPasting(true);

    try {
      // Check if clipboard API is available
      if (!navigator.clipboard) {
        showNotification({
          msg: "Clipboard access is not supported in this browser. Please use a modern browser to enable copy/paste functionality.",
          variant: "error",
        });
        setIsPasting(false);
        return;
      }

      const rawClipboardData = await navigator.clipboard.readText();
      let clipboardData = safeParseJSON(rawClipboardData);

      if (!clipboardData) {
        showNotification({
          msg: "No valid dashboard data found in clipboard. Please copy a dashboard item first.",
          variant: "warning",
        });
        setIsPasting(false);
        return;
      }

      // Validate the clipboard data structure
      if (
        !clipboardData.plots ||
        !Array.isArray(clipboardData.plots) ||
        clipboardData.plots.length === 0
      ) {
        showNotification({
          msg: "No valid dashboard items found in clipboard. Please copy a dashboard item first.",
          variant: "warning",
        });
        setIsPasting(false);
        return;
      }

      // Generate new unique IDs for the plots to avoid conflicts
      const plotConfigs = clipboardData.plots.map((plot, index) => {
        const newId = `${plot.name || "plot"}_${Date.now()}_${index}`;
        return {
          ...plot,
          name: newId,
          // Update any references to the old ID in the plot config
          raw_params: plot.raw_params
            ? {
                ...plot.raw_params,
                panel_id: newId,
              }
            : undefined,
        };
      });

      // Generate new layout with updated IDs
      const layout = clipboardData.layout
        ? clipboardData.layout.map((layoutItem: any, index: number) => {
            const originalPlot = clipboardData.plots[index];
            const newId = `${
              originalPlot.name || "plot"
            }_${Date.now()}_${index}`;
            return {
              ...layoutItem,
              id: newId,
            };
          })
        : null;

      const auto_layout = clipboardData.auto_layout;

      triggerPanelEvent(panelId, {
        panelId,
        operator: schema.view.on_duplicate_item,
        params: {
          plot_configs: plotConfigs,
          layout: layout,
          auto_layout: auto_layout,
        },
        callback: (result) => {
          if (auto_layout !== undefined) {
            setAutoLayout(auto_layout);
          }
          if (layout && layout.length > 0) {
            setCustomLayout(layout);
          }
          setIsPasting(false);

          // Show success notification
          showNotification({
            msg: `Successfully pasted ${plotConfigs.length} plot(s)`,
            variant: "success",
          });
        },
      });
    } catch (error) {
      console.error("Error pasting items:", error);
      setIsPasting(false);

      // Handle specific clipboard permission errors
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        showNotification({
          msg: "Clipboard access denied. Please allow clipboard permissions in your browser settings and try again.",
          variant: "error",
        });
      } else if (
        error instanceof DOMException &&
        error.name === "SecurityError"
      ) {
        showNotification({
          msg: "Clipboard access blocked for security reasons. Please ensure you're on a secure connection (HTTPS) and try again.",
          variant: "error",
        });
      } else {
        showNotification({
          msg: "Failed to paste items. Please check that you have valid dashboard data in your clipboard and try again.",
          variant: "error",
        });
      }
    }
  }, [
    panelId,
    schema.view.on_duplicate_item,
    triggerPanelEvent,
    showNotification,
  ]);

  // Selection handlers - now support multiple selection
  const handleItemSelect = useCallback(
    (id: string, event?: React.MouseEvent) => {
      setSelectedItemIds((prev) => {
        const newSet = new Set(prev);
        if (event?.ctrlKey || event?.metaKey) {
          // Ctrl/Cmd+click toggles selection
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
        } else if (event?.shiftKey && prev.size > 0) {
          // Shift+click for range selection
          const items = propertiesAsArray.map((p) => p.id);
          const lastSelected = Array.from(prev).pop();
          const lastIndex = items.indexOf(lastSelected);
          const currentIndex = items.indexOf(id);
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          for (let i = start; i <= end; i++) {
            newSet.add(items[i]);
          }
        } else {
          // Regular click selects only this item
          newSet.clear();
          newSet.add(id);
        }
        return newSet;
      });
    },
    [propertiesAsArray]
  );

  const handleItemDeselect = useCallback(() => {
    setSelectedItemIds(new Set());
  }, []);

  const handleItemToggle = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAllItems = useCallback(() => {
    if (propertiesAsArray.length === 0) {
      return;
    }

    // Enter edit mode if not already in edit mode
    setIsEditMode(true);

    setSelectedItemIds(new Set(propertiesAsArray.map((p) => p.id)));
  }, [propertiesAsArray]);

  const deleteSelectedItems = useCallback(() => {
    if (selectedItemIds.size === 0) {
      return;
    }

    // Check if we have a multi-remove operator, otherwise fall back to individual deletes
    if (schema.view.on_remove_items) {
      // Use multi-remove operator
      triggerPanelEvent(panelId, {
        panelId,
        operator: schema.view.on_remove_items,
        params: { ids: Array.from(selectedItemIds) },
      });
    } else {
      // Fall back to individual deletes
      let i = 0;
      for (const id of selectedItemIds) {
        onCloseItem({
          id: id,
          path: getPath(path, id),
        });
      }
    }
    handleItemDeselect(); // Clear selection after deletion
  }, [
    selectedItemIds,
    onCloseItem,
    path,
    handleItemDeselect,
    schema.view.on_remove_items,
    triggerPanelEvent,
    panelId,
  ]);

  const auto_layout_default = schema.view.auto_layout === false ? false : true;
  const [autoLayout, setAutoLayout] = useState(auto_layout_default);
  const [numRows, setNumRows] = useState(schema.view.rows || 1);
  const [numCols, setNumCols] = useState(schema.view.cols || 1);
  const [layoutMode, setLayoutMode] = useState("columns");
  const [anchorEl, setAnchorEl] = useState(null);
  const [customLayout, setCustomLayout] = useState(schema.view.items || []);
  const [isPasting, setIsPasting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null
  );

  // Get platform-specific shortcut key
  const shortcutKey = getPlatformShortcutKey();

  const onDuplicateItem = useCallback(
    ({ id, path }) => {
      const originalItem = getFromPath(
        (panelState as any)?.state,
        `${dataPath}.${id}`
      );
      if (schema.view.on_duplicate_item && originalItem) {
        // Generate a unique ID to avoid collisions
        const newId = generateUniqueCopyId(
          id,
          (panelState as any)?.state,
          dataPath
        );

        // Get layout information for this item from customLayout
        const layoutItem = customLayout.find((item) => item.i === id);
        let layout = null;
        if (layoutItem) {
          layout = [
            {
              id: newId,
              x: layoutItem.x,
              y: layoutItem.y,
              w: layoutItem.w,
              h: layoutItem.h,
            },
          ];
        }

        // Update the original item with the new ID
        const updatedItem = {
          ...originalItem,
          name: newId,
          raw_params: originalItem.raw_params
            ? {
                ...originalItem.raw_params,
                panel_id: newId,
              }
            : undefined,
        };

        triggerPanelEvent(panelId, {
          panelId,
          operator: schema.view.on_duplicate_item,
          params: {
            plot_configs: [updatedItem],
            layout: layout,
            auto_layout: autoLayout,
          },
        });
      }
    },
    [
      panelId,
      panelState,
      dataPath,
      schema.view.on_duplicate_item,
      triggerPanelEvent,
      customLayout,
      autoLayout,
    ]
  );

  const copyItemsToClipboard = useCallback(
    (ids?: string[]) => {
      const itemsToCopy = ids || Array.from(selectedItemIds);

      if (itemsToCopy.length === 0) {
        return;
      }

      try {
        // Get all selected items from the panel state
        const plotList = [];
        const layoutList = [];

        for (const id of itemsToCopy) {
          const value = getFromPath(
            (panelState as any)?.state,
            `${dataPath}.${id}`
          );
          if (value) {
            plotList.push(value);

            // Get layout information for this item from customLayout
            const layoutItem = customLayout.find((item) => item.i === id);
            if (layoutItem) {
              layoutList.push({
                id: id,
                x: layoutItem.x,
                y: layoutItem.y,
                w: layoutItem.w,
                h: layoutItem.h,
              });
            }
          }
        }

        if (plotList.length > 0) {
          // Always include layout information if we have it, regardless of selection size
          let valueToCopy;
          if (layoutList.length > 0) {
            // Include layout information when we have layout data
            valueToCopy = JSON.stringify(
              {
                plots: plotList,
                layout: layoutList,
                auto_layout: autoLayout, // Include current auto-layout setting
                metadata: {
                  copiedAt: new Date().toISOString(),
                  totalPlots: plotList.length,
                  includesLayout: true,
                },
              },
              null,
              2
            );
          } else {
            // Just copy the plots without layout, but still include auto-layout setting
            valueToCopy = JSON.stringify(
              {
                plots: plotList,
                auto_layout: autoLayout, // Include current auto-layout setting
                metadata: {
                  copiedAt: new Date().toISOString(),
                  totalPlots: plotList.length,
                  includesLayout: false,
                },
              },
              null,
              2
            );
          }

          // Copy to clipboard
          navigator.clipboard
            .writeText(valueToCopy)
            .then(() => {
              // Set clipboard state directly since we know we just copied valid data
              clipboardData.setHasClipboardData(true);
              // Show success notification
              showNotification({
                msg: "Copied",
                variant: "success",
              });
            })
            .catch((err) => {
              console.error("Failed to copy to clipboard:", err);
              showNotification({
                msg: "Failed to copy to clipboard. Please try again.",
                variant: "error",
              });
            });
        }
      } catch (error) {
        console.error("Error copying items to clipboard:", error);
      }
    },
    [
      panelState,
      dataPath,
      clipboardData,
      selectedItemIds,
      customLayout,
      propertiesAsArray,
      showNotification,
    ]
  );

  // Backward compatibility for single item copy
  const copyItemToClipboard = useCallback(
    ({ id, path }) => {
      copyItemsToClipboard([id]);
    },
    [copyItemsToClipboard]
  );

  const onCopyItem = copyItemToClipboard;

  const handleAutoLayoutChange = (event) => {
    const { checked } = event.target;
    setAutoLayout(checked);
    const operator = schema.view.on_auto_layout_change;
    if (operator) {
      triggerPanelEvent(panelId, {
        panelId,
        operator,
        params: { auto_layout: checked },
      });
    }
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
        panelId,
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

  const handleExportMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportMenuAnchor(null);
  };

  // Keyboard event listener for Cmd+V / Ctrl+V to trigger paste and Escape to deselect
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if Cmd+A (Mac) or Ctrl+A (Windows/Linux) is pressed to select all items
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "a" &&
        propertiesAsArray.length > 0
      ) {
        event.preventDefault();

        // Select all items and enter edit mode if not already in edit mode
        if (!isEditMode) {
          setIsEditMode(true);
        }
        setSelectedItemIds(new Set(propertiesAsArray.map((p) => p.id)));
        return;
      }

      // Check if Cmd+C (Mac) or Ctrl+C (Windows/Linux) is pressed to copy selected items
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "c" &&
        isEditMode &&
        selectedItemIds.size > 0 &&
        schema.view.on_duplicate_item
      ) {
        event.preventDefault();

        // Use the shared copy function for all selected items
        copyItemsToClipboard();
        return;
      }

      // Check if Cmd+V (Mac) or Ctrl+V (Windows/Linux) is pressed
      if ((event.metaKey || event.ctrlKey) && event.key === "v") {
        // Allow paste in both edit mode and when dashboard is empty, but only if duplicate operator is available
        if (
          (isEditMode || propertiesAsArray.length === 0) &&
          schema.view.on_duplicate_item
        ) {
          event.preventDefault();
          handlePaste();
        }
      }
      // Check if Delete or Backspace is pressed to delete selected items (only in edit mode)
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        isEditMode &&
        selectedItemIds.size > 0
      ) {
        deleteSelectedItems();
      }
      // Check if Escape is pressed to deselect (only in edit mode)
      if (event.key === "Escape" && isEditMode) {
        handleItemDeselect();
      }
    };

    // Add event listener
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isEditMode,
    propertiesAsArray.length,
    handleItemDeselect,
    selectedItemIds,
    onCloseItem,
    path,
    schema.view.on_duplicate_item,
    triggerPanelEvent,
    panelId,
    panelState,
    dataPath,
    copyItemsToClipboard,
    handlePaste,
    deleteSelectedItems,
  ]);

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const toggleEditMode = () => {
    if (isEditMode) {
      handleSaveLayout();
      // Clear selection when exiting edit mode
      handleItemDeselect();
    }
    setIsEditMode(!isEditMode);
  };

  const theme = useTheme();

  const NUM_ITEMS = propertiesAsArray.length;
  const { COLS, ROWS, ROW_HEIGHT, MIN_ITEM_HEIGHT, GRID_HEIGHT, GRID_WIDTH } =
    calculateLayoutDimensions(
      NUM_ITEMS,
      layout,
      autoLayout,
      layoutMode,
      numRows,
      numCols
    );
  const orderedProperties = sortPropertiesByCustomLayout(
    propertiesAsArray,
    customLayout
  );
  const defaultLayout = orderedProperties.map((property, index) => {
    const layoutItem = {
      i: property.id,
      x: index % COLS,
      y: Math.floor(index / COLS),
      w: 1,
      h: 1,
      minW: 1, // Minimum width in grid units
      minH: Math.ceil(MIN_ITEM_HEIGHT / (GRID_HEIGHT / ROWS)), // Minimum height in grid units
    };
    return layoutItem;
  });

  const gridLayout = useMemo(() => {
    return customLayout.length > 0 ? customLayout : defaultLayout;
  }, [customLayout, defaultLayout]);

  const onExportAsPNG = useCallback(async () => {
    try {
      // Create a temporary container for the PNG export
      const exportContainer = document.createElement("div");
      exportContainer.style.position = "absolute";
      exportContainer.style.left = "-9999px";
      exportContainer.style.top = "-9999px";
      exportContainer.style.zIndex = "-1";
      document.body.appendChild(exportContainer);

      // Create a React root and render the PNG export component
      const { createRoot } = await import("react-dom/client");
      const { RecoilRoot } = await import("recoil");
      const { ThemeProvider } = await import("@fiftyone/components");
      const root = createRoot(exportContainer);

      // Render the PNG export component with necessary providers
      // Use gridLayout instead of customLayout to include unsaved changes
      root.render(
        <RecoilRoot>
          <ThemeProvider>
            <DashboardPNGExport
              schema={schema as ObjectSchemaType}
              data={data}
              path={path}
              layout={layout}
              autoLayout={autoLayout}
              layoutMode={layoutMode}
              numRows={numRows}
              numCols={numCols}
              customLayout={gridLayout}
            />
          </ThemeProvider>
        </RecoilRoot>
      );

      // Wait for the component to render and plots to load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Use html2canvas to capture the export container
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(exportContainer, {
        backgroundColor: "#2a2a2a",
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: exportContainer.scrollWidth,
        height: exportContainer.scrollHeight,
      });

      // Convert canvas to blob
      canvas.toBlob((blob) => {
        if (blob) {
          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `dashboard-${
            new Date().toISOString().split("T")[0]
          }.png`;

          // Trigger download
          document.body.appendChild(link);
          link.click();

          // Cleanup
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }, "image/png");

      // Cleanup the temporary container
      root.unmount();
      document.body.removeChild(exportContainer);
    } catch (error) {
      console.error("Error exporting dashboard as PNG:", error);
    }
  }, [
    schema,
    data,
    path,
    layout,
    autoLayout,
    layoutMode,
    numRows,
    numCols,
    gridLayout,
  ]);

  const DragHandle = styled(Box)<{
    isSelected?: boolean;
    isEditMode?: boolean;
  }>(({ theme, isSelected, isEditMode }) => ({
    cursor: isEditMode && isSelected ? "move" : "pointer",
    backgroundColor: theme.palette.background.default,
    color: theme.palette.text.secondary,
    padding: theme.spacing(0.25),
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "relative",
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      transform: isSelected ? "none" : "translateY(-1px)",
      boxShadow: isSelected ? "none" : theme.shadows[1],
    },
    "&:active": {
      transform: isSelected ? "none" : "translateY(0px)",
    },
    // Add subtle border when not in edit mode to indicate it's interactive
    // border: !isEditMode ? "1px solid #5d5e5f" : "none",
  }));

  const gridLayoutById = useMemo(() => {
    return gridLayout.reduce((layout, item) => {
      layout[item.i] = item;
      return layout;
    }, {});
  }, [gridLayout]);

  const handleLayoutChange = useCallback(
    (layout) => {
      // Skip layout changes during paste operations
      if (isPasting) {
        return;
      }

      setCustomLayout(layout);

      // Force Plotly plots to resize after layout changes
      setTimeout(() => {
        if (window.Plotly) {
          const plotlyDivs = document.querySelectorAll(".js-plotly-plot");
          plotlyDivs.forEach((div) => {
            if (div && window.Plotly) {
              window.Plotly.relayout(div as HTMLElement, {
                width: div.clientWidth,
                height: div.clientHeight,
              });
            }
          });
        }
      }, 100); // Small delay to ensure DOM has updated
    },
    [isPasting, setCustomLayout]
  );

  if (!propertiesAsArray.length) {
    if (!allow_addition) {
      return null;
    }
    return (
      <AddItemCTA
        onAdd={onAddItem}
        onPaste={handlePaste}
        view={schema.view}
        clipboardData={clipboardData}
        schema={schema}
      />
    );
  }

  return (
    <>
      <Box
        data-dashboard-container="true"
        sx={{ height: layout?.height, overflowY: "auto", overflowX: "hidden" }}
        onClick={(e) => {
          // Deselect when clicking on the background (only in edit mode)
          if (e.target === e.currentTarget && isEditMode) {
            handleItemDeselect();
          }
        }}
      >
        <ControlContainer
          onAddItem={onAddItem}
          onEditLayoutClick={handleEditLayoutClick}
          onPasteClick={handlePaste}
          onSelectAll={selectAllItems}
          onDeleteSelected={deleteSelectedItems}
          onExportItems={onExportItems}
          onExportAsPNG={onExportAsPNG}
          handleExportMenuOpen={handleExportMenuOpen}
          handleExportMenuClose={handleExportMenuClose}
          exportMenuAnchor={exportMenuAnchor}
          isEditMode={isEditMode}
          autoLayout={autoLayout}
          editLayoutOpen={Boolean(anchorEl)}
          shortcutKey={shortcutKey}
          selectedItemIds={selectedItemIds}
          clipboardData={clipboardData}
          hasMultipleItems={propertiesAsArray.length > 1}
          schema={schema}
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
          isEditMode={isEditMode}
        />
        {!isPasting && (
          <GridLayout
            onLayoutChange={handleLayoutChange}
            layout={gridLayout}
            cols={COLS}
            rowHeight={ROW_HEIGHT} // Dynamic row height
            width={GRID_WIDTH}
            margin={[8, 8]} // Reduce vertical and horizontal margins to 8px
            resizeHandles={
              !isEditMode ? [] : ["e", "w", "n", "s", "se", "sw", "ne", "nw"]
            }
            draggableHandle=".drag-handle"
            isDraggable={isEditMode}
            isResizable={isEditMode}
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
                  className={
                    selectedItemIds.has(id) && isEditMode ? "selected" : ""
                  }
                  sx={{
                    ...baseItemProps.sx,
                    border:
                      selectedItemIds.has(id) && isEditMode
                        ? "3px solid #ff6d04"
                        : "2px solid transparent",
                    borderRadius:
                      selectedItemIds.has(id) && isEditMode ? "6px" : "0px",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box",
                    position: "relative",
                  }}
                >
                  <DragHandle
                    className={
                      isEditMode && selectedItemIds.has(id) ? "drag-handle" : ""
                    }
                    isSelected={selectedItemIds.has(id)}
                    isEditMode={isEditMode}
                    onClick={(e) => {
                      if (!e.defaultPrevented && !e.isPropagationStopped()) {
                        if (!isEditMode && allowMutation) {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsEditMode(true);
                          handleItemSelect(id);
                        }
                        if (isEditMode) {
                          handleItemSelect(id, e);
                        }
                      }
                    }}
                    onMouseDown={(e) => {
                      // Only prevent default if this item is selected (to allow dragging)
                      if (
                        e.target === e.currentTarget &&
                        selectedItemIds.has(id)
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography sx={{ marginLeft: 3 }}>{label}</Typography>
                    </Box>
                    {isEditMode && (
                      <Box>
                        {allow_edit && (
                          <Tooltip title="Edit" placement="top" arrow>
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
                          </Tooltip>
                        )}
                        {schema.view.on_duplicate_item && (
                          <Tooltip title="Duplicate" placement="top" arrow>
                            <IconButton
                              size="small"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDuplicateItem({
                                  id,
                                  path: getPath(path, id),
                                });
                              }}
                              sx={{ color: theme.text.secondary }}
                            >
                              <FileCopyIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {schema.view.on_duplicate_item && (
                          <Tooltip title="Copy" placement="top" arrow>
                            <IconButton
                              size="small"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onCopyItem({ id, path: getPath(path, id) });
                              }}
                              sx={{ color: theme.text.secondary }}
                            >
                              <ContentCopyIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {allow_deletion && (
                          <Tooltip title="Remove" placement="top" arrow>
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
                          </Tooltip>
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
        )}
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
