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

export default function TableView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { columns } = view;

  const dataMissing = !Array.isArray(data) || data.length === 0;

  return (
    <Box>
      <HeaderView {...props} divider />
      {dataMissing && <EmptyState>No data provided</EmptyState>}
      {!dataMissing && (
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }}>
            <TableHead>
              <TableRow>
                {columns.map(({ key, label }) => (
                  <TableCell
                    key={key}
                    sx={{ fontWeight: 600, fontSize: "1rem" }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((item) => (
                <TableRow
                  key={item.id}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  {columns.map(({ key }) => (
                    <TableCell key={key}>{item[key]}</TableCell>
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
