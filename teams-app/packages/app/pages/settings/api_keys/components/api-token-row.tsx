import { useMutation } from '@fiftyone/hooks';
import { Dialog, Timestamp } from '@fiftyone/teams-components';
import { apiTokensDeleteMutation } from '@fiftyone/teams-state';
import { timeFromNow } from '@fiftyone/teams-utilities';
import { Button, TableCell, TableRow, Typography } from '@mui/material';
import { useState } from 'react';

type APITokenRowProps = {
  name: string;
  apiKey?: string;
  createdAt?: string | Date;
  onDelete?: Function;
  id: string;
};

export default function APITokenRow({
  name,
  createdAt,
  onDelete,
  id
}: APITokenRowProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteAPIToken, deleteInProgress] = useMutation(
    apiTokensDeleteMutation
  );

  return (
    <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
      <TableCell>
        <Typography
          variant="body1"
          sx={{
            color: (theme) => theme.palette.text.primary
          }}
        >
          {name}
        </Typography>
      </TableCell>
      <TableCell sx={{ width: '16rem' }}>
        <Typography variant="body1">
          Created <Timestamp timestamp={createdAt as string} />
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ width: '6rem' }}>
        <Button
          onClick={() => {
            setShowDeleteDialog(true);
          }}
          color="error"
        >
          Delete
        </Button>
      </TableCell>
      <Dialog
        title="Delete this key?"
        open={showDeleteDialog}
        confirmationButtonColor="error"
        onClose={() => setShowDeleteDialog(false)}
        confirmationButtonText="Delete"
        disableConfirmationButton={deleteInProgress}
        loading={deleteInProgress}
        onConfirm={() => {
          deleteAPIToken({
            successMessage: `Successfully deleted API key "${name}"`,
            errorMessage: `Failed to delete API key "${name}"`,
            variables: { keyId: id },
            onCompleted: () => {
              setShowDeleteDialog(false);
              if (onDelete) onDelete();
            }
          });
        }}
      >
        <Typography>
          Any applications that are using this key to access FiftyOne will no
          longer have access.
        </Typography>
      </Dialog>
    </TableRow>
  );
}
