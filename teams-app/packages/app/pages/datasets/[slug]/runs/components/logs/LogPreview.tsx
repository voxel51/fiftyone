import { TableSkeleton } from "@fiftyone/teams-components";
import { runsItemQuery$dataT } from "@fiftyone/teams-state";
import { useTheme } from "@mui/material";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import React, { Suspense, useCallback, useMemo } from "react";
import { TableComponents, TableVirtuoso } from "react-virtuoso";

export default function LogPreview(props) {
  if (!props) return <></>;
  const { logConnection } =
    props.runData as runsItemQuery$dataT["delegatedOperation"];

  const processedLogs = useMemo(() => {
    if (!logConnection?.edges || !Array.isArray(logConnection.edges)) return [];

    let idCounter = 1;

    return logConnection.edges.reduce((acc, { node }, index, arr) => {
      // Assign fallback values directly
      let date = node?.date || "";
      let level = node?.level || "";
      let content = node?.content?.trim() || "";

      // Skip invalid logs
      if (!date || !level || !content) return acc;

      // Check the next log entry
      let nextNode = arr[index + 1]?.node;
      let nextContent = nextNode?.content?.trim() || "";
      let nextDate = nextNode?.date || "";
      let nextLevel = nextNode?.level || "";

      // Merge multi-line logs
      if (content === "\n" || content === "") {
        if (nextContent && !nextDate && !nextLevel) {
          acc.push({
            id: idCounter++,
            date,
            level,
            content: nextContent,
          });
          return acc; // Skip adding the current log
        }
      }

      // Add the valid log entry
      acc.push({ id: idCounter++, date, level, content });

      return acc;
    }, []);
  }, [logConnection.edges]);

  return (
    <Suspense fallback={<TableSkeleton />}>
      <VirtualLogTable data={processedLogs} />
    </Suspense>
  );
}

interface LogData {
  id: number;
  date: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG" | "";
  content: string;
}

interface ColumnData {
  dataKey: keyof LogData;
  label: string;
  width?: number;
}

const VirtualLogTable = ({ data }) => {
  const { palette } = useTheme();

  const columns: ColumnData[] = useMemo(
    () => [
      { width: 160, label: "Timestamp", dataKey: "date" },
      { width: 80, label: "Level", dataKey: "level" },
      { width: 500, label: "Message", dataKey: "content" },
    ],
    []
  );

  const levelColors = useMemo(
    () => ({
      INFO: "#7FB9F4",
      WARN: "#ECD000",
      ERROR: "#DB4E45",
      DEBUG: "#B0B0B0",
      "": palette.text.primary,
    }),
    [palette.text.primary]
  );

  // Virtualized table components
  const VirtuosoTableComponents: TableComponents<LogData> = {
    Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
      <TableContainer component={Paper} {...props} ref={ref} />
    )),
    Table: (props) => (
      <Table
        {...props}
        size="small"
        sx={{ borderCollapse: "separate", tableLayout: "fixed" }}
      />
    ),
    TableHead: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
      <TableHead {...props} ref={ref} />
    )),
    TableRow,
    TableBody: React.forwardRef<HTMLTableSectionElement>((props, ref) => (
      <TableBody {...props} ref={ref} />
    )),
  };

  // Memoize fixedHeaderContent to prevent unnecessary re-renders
  const fixedHeaderContent = useCallback(
    () => (
      <TableRow>
        {columns.map((column) => (
          <TableCell
            key={column.dataKey}
            variant="head"
            style={{
              width: column.width,
              fontWeight: "bold",
              color: palette.text.secondary,
            }}
            sx={{ backgroundColor: "background.paper" }}
          >
            {column.label}
          </TableCell>
        ))}
      </TableRow>
    ),
    [columns]
  );

  // Memoize rowContent to avoid unnecessary re-renders
  const rowContent = useCallback(
    (_index: number, row: LogData) => (
      <>
        {columns.map((column) => {
          let cellStyle = {};
          if (column.dataKey === "level") {
            cellStyle = {
              color: row.level ? levelColors[row.level] : palette.text.primary,
            };
          }
          return (
            <TableCell key={column.dataKey} style={cellStyle}>
              {row[column.dataKey]}
            </TableCell>
          );
        })}
      </>
    ),
    [columns, levelColors, palette.text.primary]
  );

  return (
    <Paper style={{ height: "calc(100vh - 430px)", width: "100%" }}>
      <TableVirtuoso
        data={data}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
};
