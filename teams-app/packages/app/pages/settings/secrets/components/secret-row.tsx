import { useMutation } from '@fiftyone/hooks';
import {
  Box,
  Dialog,
  OverflowMenu,
  TextInput
} from '@fiftyone/teams-components';
import { timeFromNow } from '@fiftyone/teams-utilities';
import { TableCell, TableRow, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import {
  secretsDeleteMutation,
  secretsUpdateMutation
} from '@fiftyone/teams-state/src/Settings/secrets';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditIcon from '@mui/icons-material/Edit';

type SecretRowProps = {
  secretKey: string;
  createdAt?: string | Date;
  description?: string | null;
  onDelete?: Function;
  onUpdate?: Function;
};

export default function SecretRow({
  secretKey,
  createdAt,
  description,
  onDelete,
  onUpdate
}: SecretRowProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteSecret, deleteInProgress] = useMutation(secretsDeleteMutation);
  const [secretDescription, setSecretDescription] = useState(null);

  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateSecret, updatingSecret] = useMutation(secretsUpdateMutation);
  const handleClose = useCallback(() => {
    setShowUpdateDialog(false);
    setSecretDescription('');
  }, [setShowUpdateDialog, setSecretDescription]);

  return (
    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
      <TableCell>
        <Typography
          variant="body1"
          sx={{
            color: (theme) => theme.palette.text.primary
          }}
        >
          {secretKey}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography
          variant="body1"
          sx={{
            color: (theme) => theme.palette.text.secondary
          }}
        >
          {description}
        </Typography>
      </TableCell>

      <TableCell sx={{ width: '16rem' }}>
        {createdAt && (
          <Typography variant="body1">
            Created {timeFromNow(createdAt)}
          </Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ width: '6rem' }}>
        <OverflowMenu
          items={[
            {
              primaryText: 'Edit',
              IconComponent: <EditIcon color="secondary" />,
              onClick() {
                setShowUpdateDialog(true);
              }
            },
            {
              primaryText: <Typography color="error">Delete</Typography>,
              IconComponent: <DeleteOutlinedIcon color="error" />,
              onClick() {
                setShowDeleteDialog(true);
              }
            }
          ]}
        />
      </TableCell>
      <Dialog
        title="Edit secret"
        open={showUpdateDialog}
        onClose={handleClose}
        disableConfirmationButton={!secretDescription || updatingSecret}
        confirmationButtonText="Save"
        loading={updatingSecret}
        onConfirm={() => {
          updateSecret({
            successMessage: 'Successfully updated secret',
            errorMessage: 'Failed to update secret',
            variables: {
              key: secretKey,
              description: secretDescription
            },
            onCompleted(data) {
              setShowUpdateDialog(false);
              if (onUpdate) onUpdate(data);
            },
            onError(error) {
              console.error(error);
            }
          });
        }}
      >
        <Box>
          <Box>
            <TextInput
              fieldLabel="Key"
              value={secretKey}
              fullWidth
              disabled="true"
            />
            <Typography variant="caption" color="text.tertiary">
              Use only uppercase letters, numbers, and underscores
            </Typography>
          </Box>
          <Box paddingTop={3}>
            <TextInput
              fieldLabel="Description"
              placeholder={description || ''}
              fullWidth
              autoComplete="off"
              disabled={updatingSecret}
              onChange={(e) => {
                setSecretDescription(e.target.value);
              }}
            />
            <Typography variant="caption" color="text.tertiary">
              Add a description to help you remember what this secret is for
            </Typography>
          </Box>
        </Box>
      </Dialog>

      <Dialog
        title="Delete this secret?"
        open={showDeleteDialog}
        confirmationButtonColor="error"
        onClose={() => setShowDeleteDialog(false)}
        confirmationButtonText="Delete"
        disableConfirmationButton={deleteInProgress}
        loading={deleteInProgress}
        onConfirm={() => {
          deleteSecret({
            successMessage: `Successfully deleted secret "${secretKey}"`,
            errorMessage: `Failed to delete secret "${secretKey}"`,
            variables: { key: secretKey },
            onCompleted: () => {
              setShowDeleteDialog(false);
              if (onDelete) onDelete();
            }
          });
        }}
      >
        <Typography>
          Any FiftyOne components that are using this secretKey to access
          external resources will no longer be able to do so.
        </Typography>
      </Dialog>
    </TableRow>
  );
}
