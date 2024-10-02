import { TableContainer } from "@fiftyone/teams-components";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  TableCellProps,
} from "@mui/material";
import Link from "next/link";
import { ReactNode, Fragment } from "react";

type Cell = TableCellProps & {
  id: string;
  value?: string;
  Component?: ReactNode;
};
type Cells = Array<Cell>;
type Row = {
  id: string;
  cells: Cells;
  link?: string;
  onClick?: (e: MouseEvent, row: Row) => void;
  onHover?: (e: MouseEvent, row: Row, hovered: boolean) => void;
};
type BasicTableProps = { rows: Array<Row>; excludeContainer?: boolean };

export default function BasicTable({
  rows,
  excludeContainer,
}: BasicTableProps) {
  const Wrapper = excludeContainer ? Fragment : TableContainer;
  return (
    <Wrapper>
      <Table>
        <TableBody>
          {rows.map((row) => {
            const { id, cells, link, onClick, onHover } = row;
            const Wrapper = link ? Link : Fragment;
            const wrapperProps = link ? { href: link } : {};
            const hasOnClick = typeof onClick === "function";
            const hasOnHover = typeof onHover === "function";
            const clickable = typeof link === "string" || hasOnClick;
            return (
              <Wrapper {...wrapperProps}>
                <TableRow
                  key={id}
                  hover={clickable}
                  sx={{ cursor: clickable ? "pointer" : "default" }}
                  onClick={(e) => {
                    if (hasOnClick) onClick(e, row);
                  }}
                  onMouseEnter={(e) => {
                    if (hasOnHover) onHover(e, row, true);
                  }}
                  onMouseLeave={(e) => {
                    if (hasOnHover) onHover(e, row, false);
                  }}
                >
                  {cells.map(({ id, value, Component, ...props }) => {
                    return (
                      <TableCell {...props}>
                        {Component ? (
                          Component
                        ) : (
                          <Typography key={id}>{value}</Typography>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </Wrapper>
            );
          })}
        </TableBody>
      </Table>
    </Wrapper>
  );
}
