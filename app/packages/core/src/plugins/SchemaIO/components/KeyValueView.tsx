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
  const { path, schema, data, nested } = props;
  const { view } = schema;
  return (
    <Box>
      <Header {...view} divider />
      <TableContainer component={nested ? Box : Paper}>
        <Table>
          <TableBody>
            {Object.entries(data).map(([key, value]) => (
              <TableRow
                key={`${path}-${key}`}
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
                  {getLabel(schema, key)}
                </TableCell>
                <TableCell align="left">{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function getLabel(schema, key) {
  return schema?.properties?.[key]?.view?.label || key;
}
