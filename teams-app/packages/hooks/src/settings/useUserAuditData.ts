import { useLazyLoadLatestQuery } from '@fiftyone/hooks';
import {
  teamGetUsersAuditQueryT,
  teamUsersAuditQuery
} from '@fiftyone/teams-state';
import { useCallback, useEffect, useState } from 'react';

const useUserAuditData = () => {
  const [queryKey, setQueryKey] = useState(0);
  const [fetchError, setFetchError] = useState('');
  const defaultUserAudit = {
    users: { remaining: 0, current: 0 },
    guests: { remaining: 0, current: 0 },
    collaborators: { remaining: 0, current: 0 }
  };

  const response = useLazyLoadLatestQuery<teamGetUsersAuditQueryT>(
    teamUsersAuditQuery,
    {},
    {
      fetchKey: queryKey,
      fetchPolicy: 'store-and-network' // TODO: test this or revert to network only
    }
  );

  useEffect(() => {
    if (response) {
      if (response.usersAudit === null) {
        setFetchError('Failed to fetch license audit data. please try again.');
      } else {
        setFetchError('');
      }
    }
  }, [response]);

  const usersAudit = !response.usersAudit
    ? defaultUserAudit
    : response.usersAudit;

  const refetch = useCallback(() => {
    setQueryKey((prevKey) => prevKey + 1);
  }, []);

  const hasCollaborators = usersAudit?.collaborators != null;

  return { audit: usersAudit, refetch, hasCollaborators, fetchError };
};

export default useUserAuditData;
