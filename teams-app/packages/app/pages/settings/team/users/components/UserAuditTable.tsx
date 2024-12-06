import { TableContainer } from "@fiftyone/teams-components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";

interface Props {
  remaining: any;
  hasCollaborators?: boolean;
}
const UserAuditTable = (props: Props) => {
  const { remaining, hasCollaborators } = props;
  if (!remaining) return null;

  return (
    <TableContainer>
      <Table
        data-testid="license-info-table"
        aria-label="License status table"
        sx={{ ".MuiTableCell-root": { fontSize: "1rem" } }}
      >
        <TableHead>
          <TableRow>
            <TableCell data-testid="license-info-table-header-role">
              Role
            </TableCell>
            <TableCell
              align="right"
              data-testid="license-info-table-header-quota"
            >
              Quota
            </TableCell>
            <TableCell
              align="right"
              data-testid="license-info-table-header-occupancy"
            >
              Occupancy
            </TableCell>
            <TableCell
              align="right"
              data-testid="license-info-table-header-remaining"
            >
              Remaining
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.values(remaining).map(
            ({ current = 0, remaining = 0, role }) => {
              if (!hasCollaborators && role === "Collaborator") return null;
              return (
                <TableRow key={role}>
                  <TableCell component="th" scope="row">
                    {role}
                  </TableCell>
                  <TableCell
                    align="right"
                    data-testid={`license-table-${role.toLowerCase()}-total`}
                  >
                    {current + remaining}
                  </TableCell>
                  <TableCell
                    align="right"
                    data-testid={`license-table-${role.toLowerCase()}-current`}
                  >
                    {current}
                  </TableCell>
                  <TableCell
                    align="right"
                    data-testid={`license-table-${role.toLowerCase()}-remaining`}
                  >
                    {remaining}
                  </TableCell>
                </TableRow>
              );
            }
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default UserAuditTable;
