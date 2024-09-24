import { Pagination, TableContainer } from '@fiftyone/teams-components';
import { Box, Table, TableBody } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { FC } from 'react';
import GroupsTableRow from './GroupsTableRow';
import { Group } from '@fiftyone/teams-state';

type GroupsTableProps = {
  readonly groups: Group[];
  pageTotal: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  readOnly?: false;
};

const GroupsTable: FC<GroupsTableProps> = ({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageTotal,
  groups,
  readOnly
}) => {
  const theme = useTheme();

  return (
    <Box>
      <TableContainer
        sx={{
          border: '1px solid',
          borderColor: theme.palette.divider,
          borderRadius: 2
        }}
      >
        <Table>
          <TableBody>
            {groups.map((group) => (
              <GroupsTableRow
                group={group}
                key={group.id}
                readOnly={readOnly}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Pagination
        count={pageTotal}
        page={page}
        onChange={(e, page) => {
          onPageChange(page);
        }}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        onManualPageChange={onPageChange}
      />
    </Box>
  );
};

export default GroupsTable;
