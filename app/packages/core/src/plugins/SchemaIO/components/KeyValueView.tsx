import React from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
} from "@mui/material";
import Header from "./Header";

export default function KeyValueView(props) {
  const { schema, data, nested } = props;
  const { view } = schema;
  return (
    <Box>
      <Header {...view} divider />
      <TableContainer component={nested ? Box : Paper}>
        <Table sx={{ minWidth: 650 }}>
          <TableBody>
            {data.map((item) => (
              <TableRow
                key={item.id}
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                <TableCell
                  sx={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    width: "15%",
                    minWidth: 32,
                    maxWidth: 96,
                    color: (theme) => theme.palette.text.secondary,
                    textAlign: "right",
                  }}
                >
                  {item.label}
                </TableCell>
                <TableCell align="left">
                  {item.Component || item.value.toString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
