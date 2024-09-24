import { useCurrentUser } from '@fiftyone/hooks';
import { hasPermission } from '@fiftyone/teams-state';

export default function useCurrentUserPermission(actions) {
  const [currentUser = {}] = useCurrentUser();

  for (const action of actions) {
    if (!hasPermission(action, currentUser)) return false;
  }
  return true;
}
