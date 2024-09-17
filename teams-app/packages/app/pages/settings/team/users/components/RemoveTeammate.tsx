import {
  teamRemoveTeammateTargetState,
  teamRemoveTeammateOpenState,
  teamRemoveUserMutation
} from '@fiftyone/teams-state';
import { Dialog } from '@fiftyone/teams-components';
import { Stack, Typography } from '@mui/material';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useMutation } from '@fiftyone/hooks';
import { useRouter } from 'next/router';

export default function RemoveTeammate() {
  const [open, setOpen] = useRecoilState(teamRemoveTeammateOpenState);
  const router = useRouter();
  const teammateTargetState = useRecoilValue(teamRemoveTeammateTargetState);
  const [removeTeammate, removeTeammateInProgress] = useMutation(
    teamRemoveUserMutation
  );
  const { name, id } = teammateTargetState as any;

  return (
    <Dialog
      title="Remove this person?"
      open={open}
      onClose={() => {
        setOpen(false);
      }}
      onConfirm={() => {
        removeTeammate({
          successMessage: 'Successfully removed user from the team',
          errorMessage: 'Failed to remove user from the team',
          variables: {
            userId: id
          },
          onCompleted() {
            setOpen(false);
            router.replace(router.asPath);
          }
        });
      }}
      confirmationButtonColor="error"
      disableConfirmationButton={removeTeammateInProgress}
    >
      <Stack spacing={2}>
        <Typography>
          You are removing{' '}
          <Typography component="span" fontWeight="medium" color="text.primary">
            {name}
          </Typography>{' '}
          from your organization.
        </Typography>
        <Typography>
          Any data they&apos;ve added will remain, but they will not be able to
          log in or view any datasets.
        </Typography>
      </Stack>
    </Dialog>
  );
}
