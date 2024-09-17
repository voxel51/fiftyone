import { USER_ROLES } from '@fiftyone/teams-state/src/constants';
import { pluralize } from '@fiftyone/teams-utilities';
import { Box, Typography } from '@mui/material';
import { useCallback, useMemo } from 'react';
import { RoleData, hasSeatsForRoleChange } from './auditUtils';
import useUserAuditData from './useUserAuditData';

const useUserAudit = () => {
  const { audit, refetch, hasCollaborators, fetchError } = useUserAuditData();

  const remaining: RoleData = useMemo(() => {
    const { users, guests, collaborators } = audit;
    const hasUserCount = users.remaining !== undefined;
    const hasGuestCount = guests.remaining !== undefined;

    const cCurrent = hasCollaborators ? collaborators.current : undefined;
    const cRemaining = hasCollaborators ? collaborators.remaining : undefined;

    return {
      USERS: {
        role: 'Users',
        current: users.current,
        remaining: users.remaining,
        text: hasUserCount
          ? `${users.remaining} ${pluralize(users.remaining, 'user')}`
          : ''
      },
      COLLABORATORS: {
        role: 'Collaborator',
        current: cCurrent,
        remaining: cRemaining,
        text: hasCollaborators
          ? `${collaborators.current} ${pluralize(
              collaborators.remaining,
              'collaborator'
            )}`
          : ''
      },
      GUESTS: {
        role: 'Guest',
        current: guests.current,
        remaining: guests.remaining,
        text: hasGuestCount
          ? `${guests.remaining} ${pluralize(guests.remaining, 'guest')}`
          : ''
      }
    };
  }, [audit]);

  const remainingText = useMemo(() => {
    const uCount = remaining.USERS.remaining;
    const cCount = remaining.COLLABORATORS.remaining;
    const gCount = remaining.GUESTS.remaining;

    return remaining ? (
      <Box display="flex" width="100%">
        <Typography
          color={uCount === 0 ? 'orange' : uCount > 0 ? 'green' : 'red'}
          sx={{ mr: 0.5 }}
        >
          {remaining.USERS.text}
          {', '}
        </Typography>
        {remaining?.COLLABORATORS?.text && (
          <Typography
            color={cCount === 0 ? 'orange' : cCount > 0 ? 'green' : 'red'}
            sx={{ mr: 0.5 }}
          >
            {remaining.COLLABORATORS.text}
            {', '}
          </Typography>
        )}
        <Typography
          color={gCount === 0 ? 'orange' : gCount > 0 ? 'green' : 'red'}
          sx={{ mr: 0.5 }}
        >
          {remaining.GUESTS.text}
        </Typography>
        <Typography sx={{ mr: 1 }}>seats left.</Typography>
      </Box>
    ) : (
      ''
    );
  }, [remaining]);

  // This is for soft compliance check, during which users are blocked to add/upgrade users
  // but they can still use the app normally. They are supposed to delete/downgrade
  // users to regain compliance during the grace period
  const notInComplianceText = useMemo(() => {
    return remaining.USERS.remaining < 0 ||
      (hasCollaborators && remaining.COLLABORATORS.remaining < 0) ||
      remaining.GUESTS.remaining < 0
      ? 'Organization is in violation of License and must delete/downgrade users to regain compliance before you can add/upgrade users.'
      : '';
  }, [remaining]);

  const hasSeatsLeft = useCallback(
    (role: string, currentRole?: string) =>
      !Boolean(fetchError) &&
      hasSeatsForRoleChange(remaining, role, currentRole),
    [remaining, fetchError]
  );

  const getOpenRoles = useCallback(
    (currentRole: string) => {
      return USER_ROLES.map((r) => {
        const hasNoSeatsLeft = !hasSeatsLeft(r.id, currentRole);
        const disabledInfo = fetchError
          ? 'Failed to load license data'
          : hasNoSeatsLeft
            ? 'No seats available'
            : undefined;

        return {
          ...r,
          disabled: hasNoSeatsLeft,
          disabledInfo
        };
      });
    },
    [hasSeatsLeft, fetchError]
  );

  return {
    remaining,
    remainingText,
    hasCollaborators,
    hasSeatsLeft,
    getOpenRoles,
    notInComplianceText,
    refetch,
    error: fetchError
  };
};

export default useUserAudit;
