import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import EmptyState from "./EmptyState";
import { getComponentProps } from "../utils";

export default function TableView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { columns } = view;

  const dataMissing = !Array.isArray(data) || data.length === 0;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      {dataMissing && <EmptyState>No data provided</EmptyState>}
      {!dataMissing && (
        <TableContainer
          component={Paper}
          {...getComponentProps(props, "tableContainer")}
        >
          <Table sx={{ minWidth: 650 }} {...getComponentProps(props, "table")}>
            <TableHead {...getComponentProps(props, "tableHead")}>
              <TableRow {...getComponentProps(props, "tableHeadRow")}>
                {columns.map(({ key, label }) => (
                  <TableCell
                    key={key}
                    sx={{ fontWeight: 600, fontSize: "1rem" }}
                    {...getComponentProps(props, "tableHeadCell")}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody {...getComponentProps(props, "tableBody")}>
              {data.map((item) => (
                <TableRow
                  key={item.id}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                  {...getComponentProps(props, "tableBodyRow")}
                >
                  {columns.map(({ key }) => (
                    <TableCell
                      key={key}
                      {...getComponentProps(props, "tableBodyCell")}
                    >
                      {item[key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
