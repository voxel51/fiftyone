import { teamInvitationsSelector } from '@fiftyone/teams-state';
import { useRecoilStateLoadable } from 'recoil';
import { teamInvitationsQuery$data } from '@fiftyone/teams-state/src/Settings/__generated__//teamInvitationsQuery.graphql';

type Invitations = teamInvitationsQuery$data['invitations'];
type Invitation = Invitations[number];
type CommitInvitationUpdateProps = {
  id?: string;
  invitation?: Invitation;
};

export default function useUpdateInvitationsList() {
  const [teamInvitations, setTeamInvitations] = useRecoilStateLoadable(
    teamInvitationsSelector
  );

  function commitUpdate(props: CommitInvitationUpdateProps) {
    const { id, invitation } = props;
    const invitations: Invitations = teamInvitations?.contents;
    if (!Array.isArray(invitations)) return;
    if (invitation && id) {
      setTeamInvitations(
        invitations.map((currentInvitation) =>
          currentInvitation.id === id ? invitation : currentInvitation
        )
      );
    } else if (id) {
      setTeamInvitations(
        invitations.filter(({ id: invitationId }) => id !== invitationId)
      );
    } else {
      setTeamInvitations([...invitations, invitation]);
    }
  }

  return commitUpdate;
}
