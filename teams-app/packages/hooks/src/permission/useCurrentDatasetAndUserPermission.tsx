import { useCurrentUser } from '@fiftyone/hooks';
import { hasPermission, useCurrentDataset } from '@fiftyone/teams-state';
import { useRouter } from 'next/router';

export default function useCurrentDatasetAndUserPermission(actions) {
  const router = useRouter();
  const currentDataset = useCurrentDataset(router?.query?.slug as string);
  if (!currentDataset?.viewer) return false;
  const [currentUser = {}] = useCurrentUser();
  for (const action of actions) {
    if (
      !hasPermission(action, {
        role: currentUser?.role,
        datasetViewer: currentDataset?.viewer,
        attributes: currentUser?.attributes ?? {}
      })
    )
      return false;
  }
  return true;
}
