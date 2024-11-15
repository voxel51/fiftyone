import { scrollable } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
} from "@mui/material";
import { isPlainObject } from "lodash";
import React, { useCallback } from "react";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";
import { ViewPropsType } from "../utils/types";
import ActionsMenu from "./ActionsMenu";
import EmptyState from "./EmptyState";

export default function TableView(props: ViewPropsType) {
  const { path, schema } = props;
  const { view = {} } = schema;
  const {
    columns,
    row_actions = [],
    on_click_cell,
    on_click_row,
    on_click_column,
    actions_label,
    selected_color,
    size = "small",
    variant = "filled",
    max_icons_inline = 1,
  } = view;
  const { rows, selectedCells, selectedRows, selectedColumns } =
    getTableData(props);
  const dataMissing = rows.length === 0;
  const hasRowActions = row_actions.length > 0;
  const panelId = usePanelId();
  const handleClick = usePanelEvent();
  const theme = useTheme();
  const selectedCellColor =
    selected_color || theme.palette.background.activeCell;

  const getRowActions = useCallback((row) => {
    const computedRowActions = [] as any;
    for (const action of row_actions) {
      if (action.rows?.[row] !== false) {
        computedRowActions.push({
          ...action,
          onClick: (action, e) => {
            handleClick(panelId, {
              operator: action.on_click,
              params: { path, event: action.name, row },
            });
          },
        });
      }
    }
    return computedRowActions;
  }, []);

  const handleCellClick = useCallback(
    (row, column) => {
      if (on_click_cell) {
        handleClick(panelId, {
          operator: on_click_cell,
          params: { row, column, path, event: "on_click_cell" },
        });
      }
      if (on_click_row) {
        handleClick(panelId, {
          operator: on_click_row,
          params: { row, path, event: "on_click_row" },
        });
      }
      if (on_click_column) {
        handleClick(panelId, {
          operator: on_click_column,
          params: { column, path, event: "on_click_column" },
        });
      }
    },
    [on_click_cell, on_click_row, on_click_column, handleClick, panelId, path]
  );

  const headingCellBaseStyles = {
    fontWeight: 360,
    fontSize: "1rem",
    color: theme.palette.text.secondary,
  };
  const filled = variant === "filled";

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      {dataMissing && <EmptyState>No data provided</EmptyState>}
      {!dataMissing && (
        <TableContainer
          component={filled ? Paper : Box}
          className={scrollable}
          sx={
            filled
              ? {}
              : {
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 1,
                  "& .MuiTableCell-root": {
                    borderRight: `1px solid ${theme.palette.divider}!important`,
                  },
                  "& .MuiTableRow-root .MuiTableCell-root:last-child": {
                    borderRight: `none!important`,
                  },
                }
          }
          {...getComponentProps(props, "tableContainer")}
        >
          <Table
            sx={{ minWidth: 650 }}
            {...getComponentProps(props, "table")}
            size={size}
          >
            <TableHead {...getComponentProps(props, "tableHead")}>
              <TableRow {...getComponentProps(props, "tableHeadRow")}>
                {columns.map(({ key, label }, columnIndex) => (
                  <TableCell
                    key={key}
                    onClick={() => {
                      handleCellClick(-1, columnIndex);
                    }}
                    {...getComponentProps(props, "tableHeadCell", {
                      sx: headingCellBaseStyles,
                    })}
                  >
                    {label}
                  </TableCell>
                ))}
                {hasRowActions && (
                  <TableCell
                    {...getComponentProps(props, "tableHeadCell", {
                      sx: { ...headingCellBaseStyles, textAlign: "right" },
                    })}
                    onClick={() => {
                      handleCellClick(-1, -1);
                    }}
                  >
                    {actions_label || "Actions"}
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody {...getComponentProps(props, "tableBody")}>
              {rows.map((item, rowIndex) => {
                const rowActions = getRowActions(rowIndex);
                const currentRowHasActions = rowActions?.length > 0;
                const isRowSelected = selectedRows.has(rowIndex);
                return (
                  <TableRow
                    key={item.id}
                    sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                    {...getComponentProps(props, "tableBodyRow")}
                  >
                    {columns.map(({ key }, columnIndex) => {
                      const coordinate = [rowIndex, columnIndex].join(",");
                      const isSelected =
                        selectedCells.has(coordinate) ||
                        isRowSelected ||
                        selectedColumns.has(columnIndex);
                      return (
                        <TableCell
                          key={key}
                          sx={{
                            background: isSelected
                              ? selectedCellColor
                              : "unset",
                          }}
                          onClick={() => {
                            handleCellClick(rowIndex, columnIndex);
                          }}
                          {...getComponentProps(props, "tableBodyCell")}
                        >
                          {formatCellValue(item[key], props)}
                        </TableCell>
                      );
                    })}
                    {hasRowActions && (
                      <TableCell
                        align="right"
                        sx={{
                          background: isRowSelected
                            ? selectedCellColor
                            : "unset",
                        }}
                      >
                        {currentRowHasActions && (
                          <ActionsMenu
                            actions={getRowActions(rowIndex)}
                            size={size}
                            maxInline={max_icons_inline}
                          />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

function getTableData(props) {
  const { schema, data } = props;
  const defaultValue = schema?.default;

  if (isAdvancedData(data)) {
    return parseAdvancedData(data);
  }
  if (isAdvancedData(defaultValue)) {
    return parseAdvancedData(defaultValue);
  }
  return {
    rows: Array.isArray(data)
      ? data
      : Array.isArray(defaultValue)
      ? defaultValue
      : [],
    selectedCells: new Set(),
    selectedRows: new Set(),
    selectedColumns: new Set(),
  };
}

function isAdvancedData(data) {
  return (
    isPlainObject(data) &&
    Array.isArray(data?.rows) &&
    Array.isArray(data?.columns)
  );
}

function parseAdvancedData(data) {
  const rows = data.rows.map((row) => {
    return data.columns.reduce((cells, column, cellIndex) => {
      cells[column] = row[cellIndex];
      return cells;
    }, {});
  });
  const selectedCellsRaw = data?.selectedCells || data?.selected_cells || [];
  const selectedRowsRaw = data?.selectedRows || data?.selected_rows || [];
  const selectedColumnsRaw =
    data?.selectedColumns || data?.selected_columns || [];
  const selectedCells = new Set(selectedCellsRaw.map((cell) => cell.join(",")));
  const selectedRows = new Set(selectedRowsRaw);
  const selectedColumns = new Set(selectedColumnsRaw);
  return { rows, selectedCells, selectedRows, selectedColumns };
}

function formatCellValue(value: string, props: ViewPropsType) {
  const round = props?.schema?.view?.round;
  const valueAsFloat = parseFloat(value);
  if (!Number.isNaN(valueAsFloat) && typeof round === "number") {
    return valueAsFloat.toFixed(round);
  }
  return value;
}
