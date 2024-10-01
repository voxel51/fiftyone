import {
  NotificationFrag$dataT,
  NotificationQuery$dataT,
  UserRole,
  getNotificationsQuery,
  notificationFrag
} from '@fiftyone/teams-state';
import { NotificationFrag$key } from '@fiftyone/teams-state/src/Notification/__generated__/NotificationFrag.graphql';
import { NotificationQuery } from '@fiftyone/teams-state/src/Notification/__generated__/NotificationQuery.graphql';
import { useMemo } from 'react';
import {
  loadQuery,
  useFragment,
  usePreloadedQuery,
  useRelayEnvironment
} from 'react-relay';
import { useCurrentUser } from '../user';

export default function useAppNotification() {
  const environment = useRelayEnvironment();
  const query = useMemo(
    () => loadQuery<NotificationQuery>(environment, getNotificationsQuery, {}),
    [environment]
  );

  const data: NotificationQuery$dataT = usePreloadedQuery<NotificationQuery>(
    getNotificationsQuery,
    query
  );

   // "global" notifications should only be shown to admins
   const currentUser = useCurrentUser()[0];
   const isUserAdmin = currentUser?.role === UserRole.ADMIN

  const notifications = data.notifications.map((notification) => {
    const data: NotificationFrag$dataT = useFragment<NotificationFrag$key>(
      notificationFrag,
      notification
    );
    return {
      ...data,
      type: data?.level.toLowerCase()
    };
  }).filter((notification) => {
    // only show global notifications to admins
    if (isUserAdmin) {
      return true
    } else {
      return notification.kind.toLowerCase() !== 'global'
    }
  })

  return notifications;
}
