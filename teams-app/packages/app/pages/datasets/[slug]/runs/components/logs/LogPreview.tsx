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
import React, { Suspense } from "react";
import { TableComponents, TableVirtuoso } from "react-virtuoso";

export default function LogPreview(props) {
  if (!props) return <></>;
  const { logConnection } =
    props.runData as runsItemQuery$dataT["delegatedOperation"];

  const formattedLogs = logConnection.edges.map(({ node }, index) => ({
    id: index + 1, // Generate a sequential ID
    date: node.date || "", // Fallback if date is null
    level: node.level || "", // Default level
    content: node.content || "No content available", // Fallback message
  }));

  return (
    <Suspense fallback={<TableSkeleton />}>
      <VirtualLogTable data={formattedLogs} />
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

const VirtualLogTable = (props) => {
  let logData = props.data;

  // Define columns
  const columns: ColumnData[] = [
    {
      width: 160,
      label: "Date",
      dataKey: "date",
    },
    {
      width: 80,
      label: "Level",
      dataKey: "level",
    },
    {
      width: 500,
      label: "Log Content",
      dataKey: "content",
    },
  ];

  // Virtualized table components
  const VirtuosoTableComponents: TableComponents<LogData> = {
    Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
      <TableContainer component={Paper} {...props} ref={ref} />
    )),
    Table: (props) => (
      <Table
        {...props}
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

  // Header
  function fixedHeaderContent() {
    return (
      <TableRow>
        {columns.map((column) => (
          <TableCell
            key={column.dataKey}
            variant="head"
            style={{ width: column.width, fontWeight: "bold" }}
            sx={{ backgroundColor: "background.paper" }}
          >
            {column.label}
          </TableCell>
        ))}
      </TableRow>
    );
  }

  const { palette } = useTheme();

  const levelColors: Record<string, string> = {
    INFO: "#7FB9F4",
    WARN: "#ECD000",
    ERROR: "#DB4E45",
    DEBUG: "#B0B0B0",
    "": palette.text.primary,
  };

  // Row content
  function rowContent(_index: number, row: LogData) {
    return (
      <React.Fragment>
        {columns.map((column) => {
          let cellStyle = {};
          if (column.dataKey === "level") {
            cellStyle = {
              color:
                row.level !== ""
                  ? levelColors[row.level]
                  : palette.text.primary,
            };
          }
          return (
            <TableCell key={column.dataKey} style={cellStyle}>
              {row[column.dataKey]}
            </TableCell>
          );
        })}
      </React.Fragment>
    );
  }

  return (
    <Paper style={{ height: "calc(100vh - 280px)", width: "100%" }}>
      <TableVirtuoso
        data={logData}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
};
