import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { getComponentProps } from "../utils";

export default function KeyValueView(props) {
  const { path, schema, data, nested } = props;

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} divider nested />
      <TableContainer
        component={nested ? Box : Paper}
        {...getComponentProps(props, "tableContainer")}
      >
        <Table {...getComponentProps(props, "table")}>
          <TableBody {...getComponentProps(props, "tableBody")}>
            {Object.entries(data).map(([key, value]) => (
              <TableRow
                key={`${path}-${key}`}
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                {...getComponentProps(props, "tableRow")}
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
                  {...getComponentProps(props, "key")}
                >
                  {getLabel(schema, key)}
                </TableCell>
                <TableCell align="left" {...getComponentProps(props, "value")}>
                  {value}
                </TableCell>
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
