import { TableContainer } from "@fiftyone/teams-components";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  TableCellProps,
  TableHead,
  Link as MUILink,
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
  newWindow?: boolean;
};
type BasicTableProps = {
  rows: Array<Row>;
  excludeContainer?: boolean;
  columns: Array<string>;
};

export default function BasicTable({
  rows,
  columns,
  excludeContainer,
}: BasicTableProps) {
  const Wrapper = excludeContainer ? Fragment : TableContainer;
  const showTableHead = columns?.length > 0;
  return (
    <Wrapper>
      <Table>
        {showTableHead && (
          <TableHead sx={{ borderBottom: "1px solid #333" }}>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column}>
                  <Typography
                    sx={{ color: (theme) => theme.palette.text.tertiary }}
                  >
                    {column}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
        )}
        <TableBody>
          {rows.map((row) => {
            const { id, cells, link, onClick, onHover, newWindow } = row;
            const useMUILink = link && newWindow;
            const hasOnClick = typeof onClick === "function";
            const hasOnHover = typeof onHover === "function";
            const hasLink = typeof link === "string";
            const clickable = hasLink || hasOnClick;
            const linkComponent = useMUILink ? MUILink : Link;

            return (
              <TableRow
                component={hasLink ? linkComponent : undefined}
                key={id}
                href={link}
                target={useMUILink ? "_blank" : undefined}
                hover={clickable}
                sx={{
                  cursor: clickable ? "pointer" : "default",
                  textDecoration: "none",
                  width: "100%",
                }}
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
            );
          })}
        </TableBody>
      </Table>
    </Wrapper>
  );
}
