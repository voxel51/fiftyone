import { useCurrentUser } from '@fiftyone/hooks';
import { Role, hasMinimumRole } from '@fiftyone/teams-state';

export default function useCurrentUserHasMinimumRole() {
  const [{ role }] = useCurrentUser();
  return (minimumRole: Role) => hasMinimumRole(role as Role, minimumRole);
}
