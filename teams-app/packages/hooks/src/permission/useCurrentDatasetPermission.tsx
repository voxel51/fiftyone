import { canMutateDataset, useCurrentDataset } from '@fiftyone/teams-state';
import { useRouter } from 'next/router';

export default function useCurrentDatasetPermission(actions) {
  const router = useRouter();
  const currentDataset = useCurrentDataset(router?.query?.slug as string);
  if (!currentDataset?.viewer) return false;
  for (const action of actions) {
    if (!canMutateDataset(action, currentDataset)) return false;
  }
  return true;
}
