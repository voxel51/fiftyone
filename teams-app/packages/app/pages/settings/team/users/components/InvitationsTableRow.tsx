import { TableRow, TableCell, Typography, Chip } from '@mui/material';
import {
  EditOutlined,
  Autorenew,
  RemoveCircleOutline,
  EmailOutlined
} from '@mui/icons-material';
import { OverflowMenu, Avatar, Timestamp } from '@fiftyone/teams-components';
import {
  currentInviteeState,
  settingsTeamInviteTeammateOpen,
  teamInvitationFormState,
  teamRevokeInvitationMutation,
  teamSendUserInvitationMutation
} from '@fiftyone/teams-state';
import { useSetRecoilState } from 'recoil';
import { capitalize } from 'lodash';
import {
  useMutation,
  useUpdateInvitationsList,
  DURATION_DEFAULT
} from '@fiftyone/hooks';
import { teamRevokeInvitationMutation as teamRevokeInvitationMutationType } from 'queries/__generated__/teamRevokeInvitationMutation.graphql';
import { teamSendUserInvitationMutation as teamSendUserInvitationMutationType } from 'queries/__generated__/teamSendUserInvitationMutation.graphql';
import { useSnackbar } from 'notistack';
import { isExpired, timeFromNow } from '@fiftyone/teams-utilities';

type InvitationsTableRowProps = {
  email: string;
  id: string;
  createdAt: string | Date;
  expiresAt: string | Date;
  role: string;
};

export default function InvitationsTableRow({
  email,
  id,
  createdAt,
  expiresAt,
  role
}: InvitationsTableRowProps) {
  const [revokeInvitation] = useMutation<teamRevokeInvitationMutationType>(
    teamRevokeInvitationMutation
  );
  const [sendInvitation] = useMutation<teamSendUserInvitationMutationType>(
    teamSendUserInvitationMutation
  );
  const setInviteTeammateOpen = useSetRecoilState(
    settingsTeamInviteTeammateOpen
  );
  const setTeamInvitationFormState = useSetRecoilState(teamInvitationFormState);
  const updateInvitationsList = useUpdateInvitationsList();
  const { enqueueSnackbar } = useSnackbar();
  const setCurrentInvitee = useSetRecoilState(currentInviteeState);

  const hasExpired = isExpired(expiresAt);

  return (
    <TableRow>
      <TableCell>
        <Avatar title={email} detailed>
          <EmailOutlined />
        </Avatar>
      </TableCell>
      <TableCell>
        <Typography variant="body1">
          Sent <Timestamp timestamp={createdAt} />
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body1">
          <Chip
            label={hasExpired ? 'Expired' : 'Expires'}
            color={hasExpired ? 'error' : 'success'}
            sx={{
              color: (theme) =>
                hasExpired
                  ? theme.palette.error.main
                  : theme.palette.success.main
            }}
            size="small"
          />{' '}
          <Timestamp timestamp={expiresAt} />
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body1">{capitalize(role)}</Typography>
      </TableCell>
      <TableCell>
        <OverflowMenu
          items={[
            {
              primaryText: 'Edit role',
              IconComponent: <EditOutlined />,
              onClick: () => {
                setCurrentInvitee({ email, id, role });
                setTeamInvitationFormState({ email, id, role });
                setInviteTeammateOpen(true);
              }
            },
            // {
            //   primaryText: 'Resend invitation email',
            //   IconComponent: <Autorenew />,
            //   onClick: () => {
            //     sendInvitation({
            //       successMessage: 'Successfully resent an invitation email',
            //       errorMessage: 'Failed to resend an invitation email',
            //       variables: { email, role },
            //       onCompleted: (data) => {
            //         // TODO: use useNotification - it is broken
            //         enqueueSnackbar(
            //           `Successfully resent invitation to ${data.sendUserInvitation.inviteeEmail}`,
            //           {
            //             variant: 'success',
            //             autoHideDuration: DURATION_DEFAULT,
            //             anchorOrigin: {
            //               horizontal: 'center',
            //               vertical: 'bottom'
            //             },
            //             preventDuplicate: true
            //           }
            //         );
            //         updateInvitationsList({
            //           id,
            //           invitation: data?.sendUserInvitation
            //         });
            //       },
            //       onError: () => {
            //         // TODO: use useNotification - it is broken
            //         enqueueSnackbar(`Failed to resend invitation}`, {
            //           variant: 'error',
            //           autoHideDuration: DURATION_DEFAULT,
            //           anchorOrigin: {
            //             horizontal: 'center',
            //             vertical: 'bottom'
            //           },
            //           preventDuplicate: true
            //         });
            //       }
            //     });
            //   }
            // },
            {
              primaryText: 'Revoke invitation',
              IconComponent: <RemoveCircleOutline />,
              onClick: () => {
                revokeInvitation({
                  successMessage: 'Successfully revoked the invitation',
                  errorMessage: 'Failed to revoke the invitation',
                  variables: { invitationId: id },
                  onCompleted: () => {
                    updateInvitationsList({ id });
                  }
                });
              }
            }
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
