import React, { useEffect } from "react";
import { useTheme } from "@fiftyone/components";
import usePanelEvent from "@fiftyone/operators/src/usePanelEvent";
import { usePanelId, usePanelState } from "@fiftyone/spaces";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DownloadIcon from "@mui/icons-material/Download";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
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
  Typography,
} from "@mui/material";
import { forwardRef, useCallback, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ButtonView } from ".";
import { getPath, getProps } from "../utils";
import { ObjectSchemaType, ViewPropsType } from "../utils/types";
import DynamicIO from "./DynamicIO";
import { get, get as getFromPath } from "lodash";

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

function useHasClipboardData() {
  const [hasClipboardData, setHasClipboardData] = useState(false);
  useEffect(() => {
    navigator.clipboard.readText().then((text) => {
      try {
        const item = JSON.parse(text);
        if (typeof item === "object" && item !== null) {
          setHasClipboardData(true);
        } else {
          setHasClipboardData(false);
        }
      } catch (error) {
        setHasClipboardData(false);
      }
    });
  }, []);
  return hasClipboardData;
}

const AddItemCTA = ({ onAdd, onPaste, view }) => {
  const header = view?.cta_title || "No items yet";
  const body =
    view?.cta_body ||
    "Add items to this dashboard to start exploring, plotting, and sharing.";
  const cta_button_label = view?.cta_button_label || "Add Item";
  const paste_button_label = view?.paste_button_label || "Paste Plot";

  // Detect platform for keyboard shortcut display
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘V" : "Ctrl+V";
  const hasClipboardData = useHasClipboardData();

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
          {onPaste && hasClipboardData && (
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
  onExportItems,
  onExportAsPNG,
  handleExportMenuOpen,
  handleExportMenuClose,
  exportMenuAnchor,
  isEditMode,
  autoLayout,
  editLayoutOpen,
  shortcutKey,
  selectedItemId,
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
      <ButtonView
        {...createButtonViewProps(
          {
            type: "object",
            view: {
              icon: "content_paste",
              label: `Paste (${shortcutKey})`,
              variant: "square",
            },
          },
          onPasteClick
        )}
      />
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

      {editLayoutOpen && !selectedItemId && (
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

  for (const property in properties) {
    propertiesAsArray.push({ id: property, ...properties[property] });
  }

  const panelId = usePanelId();
  const triggerPanelEvent = usePanelEvent();

  // Selection state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

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

  const onDuplicateItem = useCallback(
    ({ id, path }) => {
      const originalItem = getFromPath(
        (panelState as any)?.state,
        `${dataPath}.${id}`
      );
      const newId = `${id}-copy`;
      if (schema.view.on_duplicate_item) {
        triggerPanelEvent(panelId, {
          panelId,
          operator: schema.view.on_duplicate_item,
          params: { id: newId, plot_config: originalItem },
        });
      }
    },
    [
      panelId,
      panelState,
      dataPath,
      schema.view.on_duplicate_item,
      triggerPanelEvent,
    ]
  );

  const onCopyItem = useCallback(
    ({ id, path }) => {
      const value = getFromPath(
        (panelState as any)?.state,
        `${dataPath}.${id}`
      );
      console.log({ id, path, panelState });
      if (value) {
        try {
          // Convert the value to a string representation
          const valueToCopy =
            typeof value === "object"
              ? JSON.stringify(value, null, 2)
              : String(value);

          // Copy to clipboard
          navigator.clipboard.writeText(valueToCopy).catch((err) => {
            console.error("Failed to copy to clipboard:", err);
          });
        } catch (error) {
          console.error("Error copying item to clipboard:", error);
        }
      }
    },
    [panelState, dataPath]
  );

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

      console.log("Dashboard items and config exported successfully");
    } catch (error) {
      console.error("Error exporting dashboard items:", error);
    }
  }, [panelState, dataPath]);

  // Unified paste handler that works in both edit mode and when dashboard is empty
  const handlePaste = useCallback(async () => {
    console.log("handlePaste called");
    try {
      const clipboardData = await navigator.clipboard.readText();
      console.log("Clipboard data received:", clipboardData);
      let item;
      try {
        item = JSON.parse(clipboardData);
        console.log("Parsed item:", item);
      } catch (error) {
        console.error("Error parsing clipboard data:", error);
        return;
      }

      if (item && schema.view.on_duplicate_item) {
        console.log("Triggering duplicate item operator with:", item);
        triggerPanelEvent(panelId, {
          panelId,
          operator: schema.view.on_duplicate_item,
          params: { plot_config: item },
        });
      } else {
        console.log("Missing item or on_duplicate_item operator:", {
          item: !!item,
          on_duplicate_item: !!schema.view.on_duplicate_item,
        });
      }
    } catch (error) {
      console.error("Error reading clipboard:", error);
    }
  }, [panelId, schema.view.on_duplicate_item, triggerPanelEvent]);

  // Selection handlers
  const handleItemSelect = useCallback((id: string) => {
    setSelectedItemId(id);
  }, []);

  const handleItemDeselect = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  const auto_layout_default = schema.view.auto_layout === false ? false : true;
  const [autoLayout, setAutoLayout] = useState(auto_layout_default);
  const [numRows, setNumRows] = useState(schema.view.rows || 1);
  const [numCols, setNumCols] = useState(schema.view.cols || 1);
  const [layoutMode, setLayoutMode] = useState("columns");
  const [anchorEl, setAnchorEl] = useState(null);
  const [customLayout, setCustomLayout] = useState(schema.view.items || []);
  const [isEditMode, setIsEditMode] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(
    null
  );

  // Detect platform for keyboard shortcut display
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘ + V" : "Ctrl + V";

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

  const onExportAsPNG = useCallback(async () => {
    try {
      // Temporarily switch to non-edit mode for clean capture
      const wasInEditMode = isEditMode;
      if (isEditMode) {
        setIsEditMode(false);
        // Wait for the UI to update
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Find the dashboard container element - look for the specific dashboard container
      const dashboardElement = document.querySelector(
        '[data-dashboard-container="true"]'
      ) as HTMLElement;

      if (!dashboardElement) {
        console.error("Dashboard container not found");
        return;
      }

      // Use html2canvas to capture the dashboard
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(dashboardElement, {
        backgroundColor: "#ffffff",
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: dashboardElement.scrollWidth,
        height: dashboardElement.scrollHeight,
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

          console.log("Dashboard exported as PNG successfully");
        }
      }, "image/png");

      // Restore edit mode if it was enabled
      if (wasInEditMode) {
        setIsEditMode(true);
      }
    } catch (error) {
      console.error("Error exporting dashboard as PNG:", error);
    }
  }, [isEditMode, setIsEditMode]);

  const handleDuplicateItem = useCallback(
    (event) => {
      // duplicate an item from the clipboard
      navigator.clipboard
        .readText()
        .then((clipboardData) => {
          let item;
          try {
            item = JSON.parse(clipboardData);
          } catch (error) {
            console.error("Error parsing clipboard data:", error);
            return;
          }
          if (item && schema.view.on_duplicate_item) {
            triggerPanelEvent(panelId, {
              panelId,
              operator: schema.view.on_duplicate_item,
              params: { plot_config: item },
            });
          }
        })
        .catch((error) => {
          console.error("Error reading clipboard:", error);
        });
    },
    [panelId, schema.view.on_duplicate_item, triggerPanelEvent]
  );

  // Keyboard event listener for Cmd+V / Ctrl+V to trigger paste and Escape to deselect
  useEffect(() => {
    const handleKeyDown = (event) => {
      console.log(
        "Key pressed:",
        event.key,
        "Ctrl:",
        event.ctrlKey,
        "Meta:",
        event.metaKey,
        "isEditMode:",
        isEditMode,
        "propertiesAsArray.length:",
        propertiesAsArray.length
      );

      // Check if Cmd+C (Mac) or Ctrl+C (Windows/Linux) is pressed to copy selected item
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "c" &&
        isEditMode &&
        selectedItemId
      ) {
        console.log("Copy key combination detected for selected item");
        event.preventDefault();

        // Copy the selected item to clipboard
        const value = getFromPath(
          (panelState as any)?.state,
          `${dataPath}.${selectedItemId}`
        );
        if (value) {
          try {
            const valueToCopy =
              typeof value === "object"
                ? JSON.stringify(value, null, 2)
                : String(value);

            navigator.clipboard
              .writeText(valueToCopy)
              .then(() => {
                console.log("Item copied to clipboard successfully");
              })
              .catch((err) => {
                console.error("Failed to copy to clipboard:", err);
              });
          } catch (error) {
            console.error("Error copying item to clipboard:", error);
          }
        }
        return;
      }

      // Check if Cmd+V (Mac) or Ctrl+V (Windows/Linux) is pressed
      if ((event.metaKey || event.ctrlKey) && event.key === "v") {
        console.log("Paste key combination detected");
        // Allow paste in both edit mode and when dashboard is empty
        if (isEditMode || propertiesAsArray.length === 0) {
          console.log(
            "Paste conditions met, preventing default and calling handlePaste"
          );
          event.preventDefault();

          // Inline paste logic to avoid dependency issues
          (async () => {
            try {
              const clipboardData = await navigator.clipboard.readText();
              console.log("Clipboard data received:", clipboardData);
              let item;
              try {
                item = JSON.parse(clipboardData);
                console.log("Parsed item:", item);
              } catch (error) {
                console.error("Error parsing clipboard data:", error);
                return;
              }

              if (item && schema.view.on_duplicate_item) {
                console.log("Triggering duplicate item operator with:", item);
                triggerPanelEvent(panelId, {
                  panelId,
                  operator: schema.view.on_duplicate_item,
                  params: { plot_config: item },
                });
              } else {
                console.log("Missing item or on_duplicate_item operator:", {
                  item: !!item,
                  on_duplicate_item: !!schema.view.on_duplicate_item,
                });
              }
            } catch (error) {
              console.error("Error reading clipboard:", error);
            }
          })();
        } else {
          console.log(
            "Paste conditions not met - isEditMode:",
            isEditMode,
            "propertiesAsArray.length:",
            propertiesAsArray.length
          );
        }
      }
      // Check if Delete or Backspace is pressed to delete selected item (only in edit mode)
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        isEditMode &&
        selectedItemId
      ) {
        event.preventDefault();
        onCloseItem({
          id: selectedItemId,
          path: getPath(path, selectedItemId),
        });
        handleItemDeselect(); // Clear selection after deletion
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
    selectedItemId,
    onCloseItem,
    path,
    schema.view.on_duplicate_item,
    triggerPanelEvent,
    panelId,
    panelState,
    dataPath,
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

  if (!propertiesAsArray.length) {
    if (!allow_addition) {
      return null;
    }
    return (
      <AddItemCTA onAdd={onAddItem} onPaste={handlePaste} view={schema.view} />
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
          onExportItems={onExportItems}
          onExportAsPNG={onExportAsPNG}
          handleExportMenuOpen={handleExportMenuOpen}
          handleExportMenuClose={handleExportMenuClose}
          exportMenuAnchor={exportMenuAnchor}
          isEditMode={isEditMode}
          autoLayout={autoLayout}
          editLayoutOpen={Boolean(anchorEl)}
          shortcutKey={shortcutKey}
          selectedItemId={selectedItemId}
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
                sx={{
                  ...baseItemProps.sx,
                  border:
                    selectedItemId === id && isEditMode
                      ? "2px dotted #ff6d04"
                      : "2px solid transparent",
                  borderRadius:
                    selectedItemId === id && isEditMode ? "4px" : "0px",
                  transition: "all 0.2s ease",
                  boxSizing: "border-box",
                }}
              >
                <DragHandle
                  className={
                    isEditMode && selectedItemId === id ? "drag-handle" : ""
                  }
                  isSelected={selectedItemId === id}
                  isEditMode={isEditMode}
                  onClick={(e) => {
                    if (!e.defaultPrevented && !e.isPropagationStopped()) {
                      if (!isEditMode && allowMutation) {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsEditMode(true);
                        setSelectedItemId(id);
                      }
                      if (isEditMode) {
                        handleItemSelect(id);
                      }
                    }
                  }}
                  onMouseDown={(e) => {
                    // Only prevent default if this item is selected (to allow dragging)
                    if (e.target === e.currentTarget && selectedItemId === id) {
                      e.preventDefault();
                    }
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Typography sx={{ marginLeft: 3 }}>{label}</Typography>
                    {isEditMode && selectedItemId === id && (
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", fontSize: "0.7rem" }}
                      >
                        Press {shortcutKey.replace("V", "C")} to copy, Delete to
                        remove.
                      </Typography>
                    )}
                  </Box>
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
                      <IconButton
                        size="small"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateItem({ id, path: getPath(path, id) });
                        }}
                        sx={{ color: theme.text.secondary }}
                        title="Duplicate item"
                      >
                        <FileCopyIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyItem({ id, path: getPath(path, id) });
                        }}
                        sx={{ color: theme.text.secondary }}
                        title="Copy item"
                      >
                        <ContentCopyIcon />
                      </IconButton>
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
