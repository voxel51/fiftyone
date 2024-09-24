interface RoleInfo {
  role: string;
  current: number;
  remaining: number;
  text: string;
}

export interface RoleData {
  USERS: RoleInfo;
  COLLABORATORS: RoleInfo;
  GUESTS: RoleInfo;
}

export const hasSeatsForRoleChange = (
  remaining: RoleData,
  nextRole: string,
  currentRole?: string
) => {
  if (!nextRole || !remaining) return false;

  const { USERS, GUESTS, COLLABORATORS } = remaining;
  const hasCollaborators = !!remaining?.COLLABORATORS?.text;
  const remainingUserCount = USERS.remaining;

  // Case for GUEST role change
  if (nextRole === 'GUEST') {
    if (GUESTS.remaining < 1) {
      return false;
    } else {
      return true;
    }
  }

  // Case when max_collaborator is defined (i.e. users don't include collaborators)
  if (hasCollaborators) {
    if (
      ['ADMIN', 'MEMBER'].includes(currentRole) &&
      ['ADMIN', 'MEMBER'].includes(nextRole)
    ) {
      return true;
    }
    if (remainingUserCount < 1 && ['ADMIN', 'MEMBER'].includes(nextRole)) {
      return false;
    }
    if (nextRole === 'COLLABORATOR' && COLLABORATORS.remaining < 1) {
      return false;
    }
  }

  // Case when max_collaborator is not defined (i.e. users include collaborators)
  if (!hasCollaborators) {
    if (
      ['ADMIN', 'MEMBER', 'COLLABORATOR'].includes(currentRole) &&
      ['ADMIN', 'MEMBER', 'COLLABORATOR'].includes(nextRole)
    ) {
      return true;
    }

    if (
      remainingUserCount < 1 &&
      !['ADMIN', 'MEMBER', 'COLLABORATOR'].includes(currentRole) &&
      ['ADMIN', 'MEMBER', 'COLLABORATOR'].includes(nextRole)
    ) {
      return false;
    }
  }

  return true;
};
