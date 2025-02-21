import { TableSkeleton } from "@fiftyone/teams-components";
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
  const { logConnection } = props.runData;
  console.log("logPreview page", logConnection.edges);

  return (
    <Suspense fallback={<TableSkeleton rows={25} />}>
      <VirtualLogTable />
    </Suspense>
  );
}
interface LogData {
  id: number;
  date: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  content: string;
}

interface ColumnData {
  dataKey: keyof LogData;
  label: string;
  width?: number;
}

// Helper function to generate a random log level
const getRandomLogLevel = () => {
  const levels = ["INFO", "WARN", "ERROR", "DEBUG"];
  return levels[Math.floor(Math.random() * levels.length)];
};

// Helper function to generate a random log message
const getRandomLogMessage = () => {
  const logMessages = [
    "User logged in successfully",
    "Connection to database established",
    "File uploaded successfully",
    "Request timeout error",
    "Unexpected token in JSON response",
    "Service unavailable. Retrying...",
    "User session expired",
    "Memory usage exceeded threshold",
    "Network latency detected",
    "Application started successfully",
  ];
  return logMessages[Math.floor(Math.random() * logMessages.length)];
};

// Generates mock log data
function createData(id: number): LogData {
  return {
    id,
    date: new Date(
      Date.now() - Math.floor(Math.random() * 10000000000)
    ).toLocaleString(),
    level: getRandomLogLevel(),
    content: getRandomLogMessage(),
  };
}

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

// Generate rows
const rows: LogData[] = Array.from({ length: 200 }, (_, index) =>
  createData(index)
);

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

const levelColors: Record<string, string> = {
  INFO: "#3c19d7", // Light Blue
  WARN: "#efc807", // Light Yellow
  ERROR: "#f65707", // Light Red
  DEBUG: "#242525", // Light Gray
};

// Row content
function rowContent(_index: number, row: LogData) {
  return (
    <React.Fragment>
      {columns.map((column) => {
        let cellStyle = {};
        if (column.dataKey === "level") {
          cellStyle = {
            color: levelColors[row.level],
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

const VirtualLogTable = () => {
  return (
    <Paper style={{ height: 500, width: "100%" }}>
      <TableVirtuoso
        data={rows}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
};
