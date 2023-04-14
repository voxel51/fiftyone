import React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import Header from "./Header";

export default function TableView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  const { columns } = view;

  return (
    <Box>
      <Header {...view} divider />
      <TableContainer component={Paper}>
        <Table sx={{ minWidth: 650 }}>
          <TableHead>
            <TableRow>
              {columns.map(({ key, label }) => (
                <TableCell key={key} sx={{ fontWeight: 600, fontSize: "1rem" }}>
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
    </Box>
  );
}
