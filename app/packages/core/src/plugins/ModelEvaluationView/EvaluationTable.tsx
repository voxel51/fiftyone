import React from "react";
import {
  styled,
  Table,
  TableBody,
  TableCell,
  TableCellProps,
  TableHead,
  TableRow,
} from "@mui/material";

export default function EvaluationTable(props: EvaluationTableProps) {
  const { rows, columns } = props;
  return (
    <StyledTable>
      <TableHead>
        <TableRow>
          {columns.map((column) => {
            const { id, Component, TableCellProps = {}, value } = column;
            if (Component) return Component;
            return (
              <TableCell key={id} {...TableCellProps}>
                {value}
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell>Model</TableCell>
          <TableCell>Model</TableCell>
        </TableRow>
      </TableBody>
    </StyledTable>
  );
}

const StyledTable = styled(Table)(({ theme }) => ({
  ".MuiTableCell-root": {
    border: `1px solid ${theme.palette.divider}`,
  },
}));
EvaluationTable.defaultProps = {
  size: "small",
};

type EvaluationCell = {
  id: string;
  Component?: any;
  TableCellProps?: TableCellProps;
  value?: string | number;
};

type EvaluationTableProps = {
  rows: EvaluationCell[];
  columns: EvaluationCell[];
};
