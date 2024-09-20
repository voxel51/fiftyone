import {
  PermissionResolver,
  canMutateDataset,
  hasUserPermission,
  useCurrentDataset
} from '@fiftyone/teams-state';
import { useRouter } from 'next/router';
import { useCurrentUser } from '../user';

export default function usePermissionedItems<
  ItemType extends ItemWithPermission
>(items: ItemType[], showDisabled?: boolean): ItemType[] {
  const dataset = getUseCurrentDataset()();
  const [user] = useCurrentUser();

  if (showDisabled) {
    return items.map((item) => {
      const { permission = {} } = item;
      if (permission && !hasDatasetPermission(permission, dataset, user)) {
        const { error, label } = permission;
        const computedLabel = label ? ` to ${label}` : '';
        const title = error || `You do not have permission${computedLabel}`;
        return { ...item, disabled: true, title };
      }
      return item;
    });
  }

  return items.filter(({ permission }) => {
    return !permission || hasDatasetPermission(permission, dataset, user);
  });
}

function getUseCurrentDataset() {
  const router = useRouter();
  const slug = router?.query?.slug;
  return slug ? useCurrentDataset.bind({}, slug) : useNull;
}

function useNull() {
  return null;
}

function hasDatasetPermission(permission: Permission, dataset, user) {
  const { dataset: datasetActions = [], user: userActions = [] } = permission;

  const datasetActionsAllowed = datasetActions.every((action) => {
    return canMutateDataset(action, dataset);
  });
  const userActionsAllowed = userActions.every((action) => {
    return hasUserPermission(action, user);
  });
  return datasetActionsAllowed && userActionsAllowed;
}

type Permission = {
  dataset?: Array<PermissionResolver>;
  user?: Array<PermissionResolver>;
  error?: string;
  label?: string;
};

export type ItemWithPermission = {
  permission?: Permission;
};
