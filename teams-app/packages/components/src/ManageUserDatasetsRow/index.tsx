import React from 'react';
import { DatasetPermissionSelection } from '@fiftyone/teams-components';
import { TableRow, TableCell, IconButton, Typography } from '@mui/material';
import { DeleteOutline as DeleteOutlineIcon } from '@mui/icons-material';
import { useMutation } from '@fiftyone/hooks';
import {
  manageDatasetSetDatasetUserPermissionMutation,
  manageDatasetRemoveDatasetUserPermissionMutation,
  settingsTeamSelectedUserId,
  settingsTeamUserDatasetsUpdateCount
} from '@fiftyone/teams-state';
import { useRecoilState, useRecoilValue } from 'recoil';

type UserDataset = {
  id: string;
  name: string;
  samplesCount: number;
  permission: string;
  disabled?: boolean;
};
export default function ManageUserDatasetsRow({
  id,
  name,
  samplesCount,
  permission,
  disabled
}: UserDataset) {
  const userId = useRecoilValue(settingsTeamSelectedUserId);
  const [count, setCount] = useRecoilState(settingsTeamUserDatasetsUpdateCount);
  const [setDatasetUserPermission] = useMutation(
    manageDatasetSetDatasetUserPermissionMutation
  );
  const [removeDatasetUserPermission] = useMutation(
    manageDatasetRemoveDatasetUserPermissionMutation
  );
  const samplesCountSuffix = samplesCount === 1 ? 'sample' : 'samples';
  return (
    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
      <TableCell>
        <Typography color="text.primary">{name}</Typography>
        <Typography>
          {samplesCount} {samplesCountSuffix}
        </Typography>
      </TableCell>
      <TableCell sx={{ width: 132 }} {...(disabled ? { align: 'right' } : {})}>
        <DatasetPermissionSelection
          defaultValue={permission}
          readOnly={disabled}
          onChange={(permission) => {
            setDatasetUserPermission({
              variables: {
                datasetIdentifier: id,
                userId,
                permission
              },
              onCompleted() {
                setCount(count + 1);
              }
            });
          }}
        />
      </TableCell>
      {!disabled && (
        <TableCell align="right" sx={{ width: 84 }}>
          <IconButton
            onClick={() => {
              removeDatasetUserPermission({
                variables: { userId, datasetIdentifier: id },
                onCompleted() {
                  setCount(count + 1);
                }
              });
            }}
          >
            <DeleteOutlineIcon />
          </IconButton>
        </TableCell>
      )}
    </TableRow>
  );
}
