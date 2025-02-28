import { TableSkeleton } from "@fiftyone/teams-components";
import { runsLogQuery, runsLogQuery$dataT } from "@fiftyone/teams-state";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import useTheme from "@mui/material/styles/useTheme";
import React, { Suspense, useCallback, useMemo } from "react";
import { usePreloadedQuery } from "react-relay";
import { TableComponents, TableVirtuoso } from "react-virtuoso";
import { DefaultLog } from "../Logs";
import { useNotification } from "@fiftyone/hooks";

export default function LogPreview({ queryRef }) {
  const data = usePreloadedQuery<runsLogQuery$dataT>(
    runsLogQuery,
    queryRef
  ) as runsLogQuery$dataT;
  const logConnection = data.delegatedOperation.logConnection;
  const [_, sendNotification] = useNotification();

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = data.delegatedOperation.logUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    sendNotification({
      msg: "Logs download started",
      variant: "success",
    });
  }, [data.delegatedOperation.logUrl]);

  // skip logs if date, level, content are all empty
  // if one line have date and level, but no content, the second line have no
  // date or level, but has content, combine the two lines
  const processedLogs = useMemo(() => {
    if (!logConnection?.edges || !Array.isArray(logConnection.edges)) return [];

    let idCounter = 1;

    return logConnection.edges.reduce((acc, { node }, index, arr) => {
      // Assign fallback values directly
      let date = node?.date || "";
      let level = node?.level || "";
      let content = node?.content?.trim() || "";

      // Skip invalid logs
      if (!date && !level && !content) return acc;

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

      return acc as LogData[];
    }, []);
  }, [logConnection.edges]);

  if (processedLogs.length == 0) {
    return <DefaultLog />;
  }

  return (
    <div>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={1}
      >
        <Typography variant="h6">
          {logConnection.edges.length === 0
            ? "Logs Preview is not available"
            : " "}
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<CloudDownloadIcon />}
          onClick={handleDownload}
        >
          Download Logs
        </Button>
      </Box>
      <Suspense fallback={<TableSkeleton />}>
        <VirtualLogTable data={processedLogs} />
      </Suspense>
    </div>
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

const VirtualLogTable = ({ data }: { data: LogData[] }) => {
  const { palette } = useTheme();

  const columns: ColumnData[] = useMemo(
    () => [
      { width: 200, label: "Timestamp", dataKey: "date" },
      { width: 80, label: "Level", dataKey: "level" },
      { label: "Message", dataKey: "content" },
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
        sx={{ borderCollapse: "separate", tableLayout: "fixed", width: "100%" }}
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
            sx={{
              width: column.width,
              fontWeight: "bold",
              color: palette.primary.main,
              fontSize: "0.875rem",
              width: column.width ?? "auto",
              backgroundColor: "background.paper",
              flexGrow: column.dataKey === "content" ? 1 : 0,
            }}
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
          let cellStyle = {
            fontWeight: "normal",
            fontSize: "0.9rem",
            minWidth: column.width ?? 0,
            maxWidth: column.dataKey === "content" ? "auto" : column.width,
            overflow: "hidden",
            flexGrow: column.dataKey === "content" ? 1 : 0,
          };
          if (column.dataKey === "level") {
            cellStyle = {
              ...cellStyle,
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
    <Paper style={{ height: "calc(100vh - 520px)", width: "100%" }}>
      <TableVirtuoso
        data={data}
        components={VirtuosoTableComponents}
        fixedHeaderContent={fixedHeaderContent}
        itemContent={rowContent}
      />
    </Paper>
  );
};
