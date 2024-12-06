/**
 * Example usage:
 *
 * canMutateDataset(DELETE_DATASET, dataset) && <Button onClick={...}>Delete</Button>
 */

import { userAttributeActions } from "./constants";

export const UserRole: UserRoleType = {
  ADMIN: "ADMIN",
  COLLABORATOR: "COLLABORATOR",
  GUEST: "GUEST",
  MEMBER: "MEMBER",
};

export const DatasetPermission = {
  NO_ACCESS: 0,
  VIEW: 1,
  TAG: 2,
  EDIT: 3,
  MANAGE: 4,
};

export type Permission = "no_access" | "view" | "tag" | "edit" | "manage";

export function formatPermission(permission: DatasetPermission): Permission {
  const permissions: Record<DatasetPermission, Permission> = {
    NO_ACCESS: "no_access",
    VIEW: "view",
    TAG: "tag",
    EDIT: "edit",
    MANAGE: "manage",
  };

  return permissions[permission];
}

const UserRoleLevels = {
  ADMIN: 4,
  COLLABORATOR: 2,
  GUEST: 1,
  MEMBER: 3,
};

export function convertToEnums(
  ctx: PermissionContext
): PermissionResolverContext {
  const enums: PermissionResolverContext = {
    ...ctx,
    datasetViewer: { permission: 0 },
  };
  if (ctx.datasetViewer) {
    const permission = permissionToEnum(ctx.datasetViewer.activePermission);
    enums.datasetViewer = {
      ...ctx.datasetViewer,
      permission,
    };
  }
  return enums;
}

export function permissionToEnum(permissionStr: DatasetPermission) {
  for (let [name, value] of Object.entries(DatasetPermission)) {
    if (permissionStr === name) return value;
  }
  throw new Error("Unknown permission");
}

export function hasPermission(
  mutation: PermissionResolver,
  ctx: PermissionContext
) {
  const resolverContext = convertToEnums(ctx);
  if (mutation && mutation.isForbidden(resolverContext)) return false;
  return true;
}

export function hasDatasetPermission(
  mutation: PermissionResolver,
  datasetWithViewer: DatasetWithViewer
) {
  return hasPermission(mutation, {
    datasetViewer: datasetWithViewer.viewer,
    attributes: {},
  });
}

export function hasUserPermission(
  mutation: PermissionResolver,
  user: UserType
) {
  return hasPermission(mutation, user);
}

export function hasMinimumRole(role: Role, minimumRole: Role) {
  return UserRoleLevels[role] >= UserRoleLevels[minimumRole];
}

/**
 * DEPRECATED - use `hasDatasetPermission` instead
 */
export function canMutateDataset(
  mutation: PermissionResolver,
  datasetWithViewer: DatasetWithViewer
) {
  return hasPermission(mutation, {
    datasetViewer: datasetWithViewer.viewer,
    attributes: {},
  });
}

/**
 * All following actions are determined by the active dataset permission of a user;
 */

// ----- Actions/Mutations -----
function datasetViewerIsNotManager({
  datasetViewer,
}: PermissionResolverContext): boolean {
  return datasetViewer.permission !== DatasetPermission.MANAGE;
}

function datasetViewerCanNotEdit({
  datasetViewer,
}: PermissionResolverContext): boolean {
  return datasetViewer.permission < DatasetPermission.EDIT;
}

export const VIEW_DATASET: PermissionResolver = {
  isForbidden({ datasetViewer }) {
    return datasetViewer.permission < DatasetPermission.VIEW;
  },
};

// delete a dataset definition and associated objects
export const DELETE_DATASET: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const EDIT_DATASET: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// rename/create/delete sidebar groups
export const MODIFY_SIDEBAR_GROUP: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// create a new field in similarity search to store distance
export const CREATE_NEW_FIELD: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// Set the permission for a user on a dataset
export const SET_DATASET_USER_PERMISSION: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// is there any changes to this flag?
export const INVITE_PEOPLE_TO_DATASET: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// sets the default permission for all users on this dataset
export const SET_DATASET_DEFAULT_PERMISSION: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// Update basic fields on a dataset (management tab -> basic info)
export const UPDATE_DATASET: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// access to dataset -> manage -> access page
export const MANAGE_DATASET_ACCESS: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const ROLLBACK_DATASET_TO_SNAPSHOT: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const DELETE_DATASET_SNAPSHOT: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const ARCHIVE_DATASET_SNAPSHOT: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const CREATE_DATASET_SNAPSHOT: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

export const CAN_PIN_UNPIN_RUN: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// manage => re-run, rename, mark as failed
export const CAN_MANAGE_ANY_RUN: PermissionResolver = {
  isForbidden: datasetViewerIsNotManager,
};

// dragging sidebar
// adding group to sidebar
// tagging samples

// this is used in useLocalSession.ts as an umbrella that covers the following
// permissions that also rely on datsetViewerCanNotEdit

export const MODIFY_DATASET: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// Change saved views
export const CHANGE_SAVED_VIEWS: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// Change workspaces
export const CHANGE_WORKSPACES: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

// Change edit custom colors
export const CHANGE_CUSTOM_COLOR: PermissionResolver = {
  isForbidden: datasetViewerCanNotEdit,
};

export const UNARCHIVE_DATASET_SNAPSHOT = VIEW_DATASET;

/**
 * All following actions are determined from the role definition of a user;
 */

// Create a dataset definition using existing dataset as base
// first create a dataset;
export const CLONE_DATASET: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.CREATE_DATASETS] !== true;
  },
};

// create a new dataset definition
export const CREATE_DATASETS: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.CREATE_DATASETS] !== true;
  },
};

// Remove a user
export const REMOVE_USER: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.EDIT_USERS] !== true;
  },
};

// Set the user role the provided user
export const SET_USER_ROLE: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.EDIT_USERS] !== true;
  },
};

// export view from a dataset
export const EXPORT_VIEW: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.EXPORT_DATASETS] !== true;
  },
};

export const CLONE_VIEW: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.CREATE_DATASETS] !== true;
  },
};

export const MANAGE_ORGANIZATION: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.MANAGE_THE_ORGANIZATION] !== true;
  },
};
//
export const CAN_MANAGE_DATASET: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.MAX_DATASET_PERMISSION] !== "MANAGE";
  },
};

export const CAN_EDIT_DATASET: PermissionResolver = {
  isForbidden({ attributes }) {
    return !["MANAGE", "EDIT"].includes(
      attributes[userAttributeActions.MAX_DATASET_PERMISSION] as string
    );
  },
};

// TODO: (not in graphql) Tag a sample
export const TAG_SAMPLE: PermissionResolver = {
  isForbidden({ datasetViewer }) {
    return datasetViewer.permission < DatasetPermission.TAG;
  },
};
// TODO: (not in graphql) Tag a sample
export const CAN_TAG_SAMPLE: PermissionResolver = {
  isForbidden({ attributes }) {
    return !["MANAGE", "EDIT", "TAG"].includes(
      attributes[userAttributeActions.MAX_DATASET_PERMISSION] as string
    );
  },
};

export const VIEW_SHARE_MODAL_ACCESS_INFO: PermissionResolver = {
  // member and above
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.VIEW_USERS] !== true;
  },
};

export const VIEW_DATASET_CREATED_BY: PermissionResolver = {
  isForbidden({ attributes }) {
    // member and above
    return attributes[userAttributeActions.VIEW_USERS] !== true;
  },
};

export const VIEW_API_KEYS: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.USE_API_KEYS] !== true;
  },
};

export const CLONE_DATASET_SNAPSHOT: PermissionResolver = {
  isForbidden({ attributes }) {
    return attributes[userAttributeActions.CREATE_DATASETS] !== true;
  },
};

// ----- Types -----

export type Role = "ADMIN" | "COLLABORATOR" | "GUEST" | "MEMBER";
export type DatasetPermission =
  | "NO_ACCESS"
  | "VIEW"
  | "TAG"
  | "EDIT"
  | "MANAGE";

export type DatasetViewer = {
  permission?: DatasetPermission;
  userPermission?: DatasetPermission;
  activePermission?: DatasetPermission;
};

export type PermissionContext = {
  role?: Role;
  datasetViewer?: DatasetViewer;
  attributes?: RolePermission;
};

type RolePermission = {
  [key: string]: string | boolean;
};

export type DatasetWithViewer = {
  viewer: DatasetViewer;
};

export type PermissionResolverContext = {
  role?: Role;
  datasetViewer?: {
    permission: number;
  };
  attributes?: RolePermission;
  currentUserId?: string;
  targetUserId?: string;
  dataset?: any;
};

export type PermissionResolver = {
  isForbidden: (ctx: PermissionResolverContext) => boolean;
};

type UserRoleType = {
  [roleId: string]: Role;
};

type UserType = { role: Role };
