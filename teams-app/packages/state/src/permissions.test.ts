import { afterEach, describe, expect, it, vi } from "vitest";
import { userAttributeActions } from "./constants";
import {
  ARCHIVE_DATASET_SNAPSHOT,
  CAN_EDIT_DATASET,
  CAN_MANAGE_ANY_RUN,
  CAN_MANAGE_DATASET,
  CAN_PIN_UNPIN_RUN,
  CHANGE_CUSTOM_COLOR,
  CHANGE_SAVED_VIEWS,
  CHANGE_WORKSPACES,
  CLONE_DATASET,
  DELETE_DATASET,
  DELETE_DATASET_SNAPSHOT,
  MANAGE_ORGANIZATION,
  PermissionResolverContext,
  REMOVE_USER,
  ROLLBACK_DATASET_TO_SNAPSHOT,
  SET_DATASET_DEFAULT_PERMISSION,
  SET_DATASET_USER_PERMISSION,
  SET_USER_ROLE,
  TAG_SAMPLE,
  UNARCHIVE_DATASET_SNAPSHOT,
  UPDATE_DATASET,
  permissionToEnum,
  CLONE_DATASET_SNAPSHOT,
  VIEW_API_KEYS,
  DatasetPermission,
  CLONE_VIEW,
  EXPORT_VIEW,
} from "./permissions";

describe(`
  Permissions
`, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("permissionToEnum: valid permission string maps to DatasetPermission correctly", () => {
    let res = permissionToEnum("NO_ACCESS");
    expect(res).toEqual(0);

    res = permissionToEnum("VIEW");
    expect(res).toEqual(1);

    res = permissionToEnum("TAG");
    expect(res).toEqual(2);

    res = permissionToEnum("EDIT");
    expect(res).toEqual(3);

    res = permissionToEnum("MANAGE");
    expect(res).toEqual(4);
  });

  it("CLONE_DATASET is forbidden if can't create dataset", () => {
    expect(
      CLONE_DATASET.isForbidden({
        attributes: { [userAttributeActions.CREATE_DATASETS]: false },
      })
    ).toBeTruthy();
  });

  it("CLONE_DATASET is not forbidden if can create dataset", () => {
    expect(
      CLONE_DATASET.isForbidden({
        attributes: { [userAttributeActions.CREATE_DATASETS]: true },
      })
    ).toBeFalsy();
  });

  it("CLONE_VIEW is forbidden if can't create dataset", () => {
    expect(
      CLONE_VIEW.isForbidden({
        attributes: { [userAttributeActions.CREATE_DATASETS]: false },
      })
    ).toBeTruthy();
  });

  it("EXPORT_VIEW is not forbidden if can create dataset", () => {
    expect(
      EXPORT_VIEW.isForbidden({
        attributes: { [userAttributeActions.EXPORT_DATASETS]: true },
      })
    ).toBeFalsy();
  });

  it("EXPORT_VIEW is forbidden if can't create dataset", () => {
    expect(
      EXPORT_VIEW.isForbidden({
        attributes: { [userAttributeActions.EXPORT_DATASETS]: false },
      })
    ).toBeTruthy();
  });

  it("CLONE_VIEW is not forbidden if can create dataset", () => {
    expect(
      CLONE_VIEW.isForbidden({
        attributes: { [userAttributeActions.CREATE_DATASETS]: true },
      })
    ).toBeFalsy();
  });

  it("CAN_MANAGE_DATASET is forbidden for MEMBER with EDIT access", () => {
    expect(
      CAN_MANAGE_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "EDIT" },
      })
    ).toBeTruthy();
  });

  it("CAN_MANAGE_DATASET is not forbidden for ADMIN with MANAGE access", () => {
    expect(
      CAN_MANAGE_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "MANAGE" },
        role: "ADMIN",
      })
    ).toBeFalsy();
  });

  it("CAN_MANAGE_DATASET is forbidden for GUEST with VIEW access", () => {
    expect(
      CAN_MANAGE_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "VIEW" },
        role: "GUEST",
      })
    ).toBeTruthy();
  });

  // CAN_EDIT_DATASET
  it("CAN_EDIT_DATASET is forbidden for GUEST with VIEW access", () => {
    expect(
      CAN_EDIT_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "VIEW" },
        role: "GUEST",
      })
    ).toBeTruthy();
  });

  it("CAN_EDIT_DATASET is forbidden for MEMBER with VIEW access", () => {
    expect(
      CAN_EDIT_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "VIEW" },
        role: "MEMBER",
      })
    ).toBeTruthy();
  });

  it("CAN_EDIT_DATASET is forbidden for MEMBER with TAG access", () => {
    expect(
      CAN_EDIT_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "TAG" },
        role: "MEMBER",
      })
    ).toBeTruthy();
  });

  it("CAN_EDIT_DATASET is NOT forbidden for MEMBER with EDIT access", () => {
    expect(
      CAN_EDIT_DATASET.isForbidden({
        attributes: { [userAttributeActions.MAX_DATASET_PERMISSION]: "EDIT" },
        role: "MEMBER",
      })
    ).toBeFalsy();
  });

  // TAG_SAMPLE

  it("TAG_SAMPLE is forbidden for no access permission", () => {
    expect(
      TAG_SAMPLE.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.NO_ACCESS,
        },
      })
    ).toBeTruthy();
  });

  it("TAG_SAMPLE is forbidden for VIEW permission", () => {
    expect(
      TAG_SAMPLE.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.VIEW,
        },
      })
    ).toBeTruthy();
  });

  it("TAG_SAMPLE is NOT forbidden for tag permission", () => {
    expect(
      TAG_SAMPLE.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.TAG,
        },
      })
    ).toBeFalsy();
  });

  it("TAG_SAMPLE is NOT forbidden for edit permission", () => {
    expect(
      TAG_SAMPLE.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.EDIT,
        },
      })
    ).toBeFalsy();
  });

  it("TAG_SAMPLE is NOT forbidden for manage permission", () => {
    expect(
      TAG_SAMPLE.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.MANAGE,
        },
      })
    ).toBeFalsy();
  });

  // delete dataset
  it("DELETE_DATASET is forbidden for EDIT permission", () => {
    expect(
      DELETE_DATASET.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.EDIT,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET is forbidden for TAG permission", () => {
    expect(
      DELETE_DATASET.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.TAG,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET is forbidden for VIEW permission", () => {
    expect(
      DELETE_DATASET.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.VIEW,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET is NOT forbidden for MANAGE permission", () => {
    expect(
      DELETE_DATASET.isForbidden({
        datasetViewer: {
          permission: DatasetPermission.MANAGE,
        },
      })
    ).toBeFalsy();
  });

  // set dataset permission for users
  it("set dataset permission for users is forbidden for VIEW permission", () => {
    expect(
      SET_DATASET_USER_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("set dataset permission for users is forbidden for EDIT permission", () => {
    expect(
      SET_DATASET_USER_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("set dataset permission for users is not forbidden for Manage permission", () => {
    expect(
      SET_DATASET_USER_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // set dataset default permission
  it("set dataset default permission for users is forbidden for VIEW permission", () => {
    expect(
      SET_DATASET_DEFAULT_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("set dataset default permission for users is forbidden for TAG permission", () => {
    expect(
      SET_DATASET_DEFAULT_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("set dataset default permission for users is forbidden for EDIT permission", () => {
    expect(
      SET_DATASET_DEFAULT_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("set dataset default permission for users is NOT forbidden for Manage permission", () => {
    expect(
      SET_DATASET_DEFAULT_PERMISSION.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // update basic fields of the dataset
  it("update basic fields of the dataset is forbidden for VIEW permission", () => {
    expect(
      UPDATE_DATASET.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("update basic fields of the dataset is forbidden for TAG permission", () => {
    expect(
      UPDATE_DATASET.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("update basic fields of the dataset is forbidden for EDIT permission", () => {
    expect(
      UPDATE_DATASET.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("update basic fields of the dataset is NOT forbidden for MANAGE permission", () => {
    expect(
      UPDATE_DATASET.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // change saved views
  it("CHANGE_SAVED_VIEWS should be forbidden if datasetViewer permission is less than EDIT", () => {
    const ctx = {
      datasetViewer: {
        permission: 2, // DatasetPermission.TAG
      },
    };
    expect(CHANGE_SAVED_VIEWS.isForbidden(ctx)).toBe(true);
  });

  it("CHANGE_SAVED_VIEWS should not be forbidden if datasetViewer permission is EDIT", () => {
    const ctx = {
      datasetViewer: {
        permission: 3, // DatasetPermission.EDIT
      },
    };
    expect(CHANGE_SAVED_VIEWS.isForbidden(ctx)).toBe(false);
  });

  it("CHANGE_SAVED_VIEWS should not be forbidden if datasetViewer permission is MANAGE", () => {
    const ctx = {
      datasetViewer: {
        permission: 4, // DatasetPermission.MANAGE
      },
    };
    expect(CHANGE_SAVED_VIEWS.isForbidden(ctx)).toBe(false);
  });

  // CAN_PIN_UNPIN_RUN

  it("CAN_PIN_UNPIN_RUN is forbidden for VIEW permission", () => {
    expect(
      CAN_PIN_UNPIN_RUN.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("CAN_PIN_UNPIN_RUN is forbidden for TAG permission", () => {
    expect(
      CAN_PIN_UNPIN_RUN.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("CAN_PIN_UNPIN_RUN is forbidden for EDIT permission", () => {
    expect(
      CAN_PIN_UNPIN_RUN.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("CAN_PIN_UNPIN_RUN is not forbidden for MANAGE permission", () => {
    expect(
      CAN_PIN_UNPIN_RUN.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // CHANGE_WORKSPACES

  it("CHANGE_WORKSPACES is forbidden for VIEW permission", () => {
    expect(
      CHANGE_WORKSPACES.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("CHANGE_WORKSPACES is forbidden for TAG permission", () => {
    expect(
      CHANGE_WORKSPACES.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("CHANGE_WORKSPACES is not forbidden for EDIT permission", () => {
    expect(
      CHANGE_WORKSPACES.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeFalsy();
  });

  it("CHANGE_WORKSPACES is not forbidden for MANAGE permission", () => {
    expect(
      CHANGE_WORKSPACES.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // CHANGE_CUSTOM_COLOR

  it("CHANGE_CUSTOM_COLOR is forbidden for VIEW permission", () => {
    expect(
      CHANGE_CUSTOM_COLOR.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("CHANGE_CUSTOM_COLOR is forbidden for TAG permission", () => {
    expect(
      CHANGE_CUSTOM_COLOR.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("CHANGE_CUSTOM_COLOR is not forbidden for EDIT permission", () => {
    expect(
      CHANGE_CUSTOM_COLOR.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeFalsy();
  });

  it("CHANGE_CUSTOM_COLOR is not forbidden for MANAGE permission", () => {
    expect(
      CHANGE_CUSTOM_COLOR.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // ROLLBACK_DATASET_TO_SNAPSHOT

  it("ROLLBACK_DATASET_TO_SNAPSHOT is forbidden for VIEW permission", () => {
    expect(
      ROLLBACK_DATASET_TO_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("ROLLBACK_DATASET_TO_SNAPSHOT is forbidden for TAG permission", () => {
    expect(
      ROLLBACK_DATASET_TO_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("ROLLBACK_DATASET_TO_SNAPSHOT is forbidden for EDIT permission", () => {
    expect(
      ROLLBACK_DATASET_TO_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("ROLLBACK_DATASET_TO_SNAPSHOT is not forbidden for MANAGE permission", () => {
    expect(
      ROLLBACK_DATASET_TO_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  // DELETE_DATASET_SNAPSHOT

  it("DELETE_DATASET_SNAPSHOT is forbidden for VIEW permission", () => {
    expect(
      DELETE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET_SNAPSHOT is forbidden for TAG permission", () => {
    expect(
      DELETE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET_SNAPSHOT is forbidden for EDIT permission", () => {
    expect(
      DELETE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("DELETE_DATASET_SNAPSHOT is not forbidden for MANAGE permission", () => {
    expect(
      DELETE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  it("ARCHIVE_DATASET_SNAPSHOT is forbidden for VIEW permission", () => {
    expect(
      ARCHIVE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 1,
        },
      })
    ).toBeTruthy();
  });

  it("ARCHIVE_DATASET_SNAPSHOT is forbidden for TAG permission", () => {
    expect(
      ARCHIVE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 2,
        },
      })
    ).toBeTruthy();
  });

  it("ARCHIVE_DATASET_SNAPSHOT is forbidden for EDIT permission", () => {
    expect(
      ARCHIVE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 3,
        },
      })
    ).toBeTruthy();
  });

  it("ARCHIVE_DATASET_SNAPSHOT is not forbidden for MANAGE permission", () => {
    expect(
      ARCHIVE_DATASET_SNAPSHOT.isForbidden({
        datasetViewer: {
          permission: 4,
        },
      })
    ).toBeFalsy();
  });

  describe("UNARCHIVE_DATASET_SNAPSHOT", () => {
    it("should be NOT forbidden for VIEW permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 1,
        },
      };
      expect(UNARCHIVE_DATASET_SNAPSHOT.isForbidden(ctx)).toBe(false);
    });

    it("should be NOT forbidden for TAG permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 2,
        },
      };
      expect(UNARCHIVE_DATASET_SNAPSHOT.isForbidden(ctx)).toBe(false);
    });

    it("should be NOT forbidden for EDIT permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 3,
        },
      };
      expect(UNARCHIVE_DATASET_SNAPSHOT.isForbidden(ctx)).toBe(false);
    });

    it("should not be forbidden for MANAGE permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 4,
        },
      };
      expect(UNARCHIVE_DATASET_SNAPSHOT.isForbidden(ctx)).toBe(false);
    });
  });

  describe("CAN_MANAGE_ANY_RUN", () => {
    it("should be forbidden for VIEW permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 1,
        },
      };
      expect(CAN_MANAGE_ANY_RUN.isForbidden(ctx)).toBe(true);
    });

    it("should be forbidden for TAG permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 2,
        },
      };
      expect(CAN_MANAGE_ANY_RUN.isForbidden(ctx)).toBe(true);
    });

    it("should be forbidden for EDIT permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 3,
        },
      };
      expect(CAN_MANAGE_ANY_RUN.isForbidden(ctx)).toBe(true);
    });

    it("should not be forbidden for MANAGE permission", () => {
      const ctx: PermissionResolverContext = {
        datasetViewer: {
          permission: 4,
        },
      };
      expect(CAN_MANAGE_ANY_RUN.isForbidden(ctx)).toBe(false);
    });
  });

  describe("CLONE_DATASET", () => {
    it("should be forbidden if CREATE_DATASETS Attribute is set to false", () => {
      const ctx: PermissionResolverContext = {
        attributes: {
          [userAttributeActions.CREATE_DATASETS]: false,
        },
      };
      expect(CLONE_DATASET.isForbidden(ctx)).toBe(true);
    });

    it("should not be forbidden if CREATE_DATASETS Attribute is set to true", () => {
      const ctx: PermissionResolverContext = {
        attributes: {
          [userAttributeActions.CREATE_DATASETS]: true,
        },
      };
      expect(CLONE_DATASET.isForbidden(ctx)).toBe(false);
    });
  });

  describe("MANAGE_ORGANIZATION", () => {
    it("should allow managing the organization if userAttributeActions.MANAGE_THE_ORGANIZATION is true", () => {
      const attributes = {
        [userAttributeActions.MANAGE_THE_ORGANIZATION]: true,
      };
      const isForbidden = MANAGE_ORGANIZATION.isForbidden({ attributes });
      expect(isForbidden).toBe(false);
    });

    it("should forbid managing the organization if userAttributeActions.MANAGE_THE_ORGANIZATION is false", () => {
      const attributes = {
        [userAttributeActions.MANAGE_THE_ORGANIZATION]: false,
      };
      const isForbidden = MANAGE_ORGANIZATION.isForbidden({ attributes });
      expect(isForbidden).toBe(true);
    });
  });

  describe("REMOVE_USER", () => {
    it("should allow removing a user if userAttributeActions.EDIT_USERS is true", () => {
      const attributes = {
        [userAttributeActions.EDIT_USERS]: true,
      };

      const isForbidden = REMOVE_USER.isForbidden({ attributes });

      expect(isForbidden).toBe(false);
    });

    it("should forbid removing a user if userAttributeActions.EDIT_USERS is false", () => {
      const attributes = {
        [userAttributeActions.EDIT_USERS]: false,
      };

      const isForbidden = REMOVE_USER.isForbidden({ attributes });

      expect(isForbidden).toBe(true);
    });
  });

  describe("SET_USER_ROLE", () => {
    it("should allow setting the user role if userAttributeActions.EDIT_USERS is true", () => {
      const attributes = {
        [userAttributeActions.EDIT_USERS]: true,
      };

      const isForbidden = SET_USER_ROLE.isForbidden({ attributes });

      expect(isForbidden).toBe(false);
    });

    it("should forbid setting the user role if userAttributeActions.EDIT_USERS is false", () => {
      const attributes = {
        [userAttributeActions.EDIT_USERS]: false,
      };

      const isForbidden = SET_USER_ROLE.isForbidden({ attributes });

      expect(isForbidden).toBe(true);
    });
  });

  describe("VIEW_API_KEYS", () => {
    it("should allow viewing API keys if user has the required attribute", () => {
      const attributes = {
        USE_API_KEYS: true,
      };

      const isForbidden = VIEW_API_KEYS.isForbidden({ attributes });

      expect(isForbidden).toBe(false);
    });

    it("should forbid viewing API keys if user does not have the required attribute", () => {
      const attributes = {
        USE_API_KEYS: false,
      };

      const isForbidden = VIEW_API_KEYS.isForbidden({ attributes });

      expect(isForbidden).toBe(true);
    });
  });

  describe("CLONE_DATASET_SNAPSHOT", () => {
    it("should allow cloning dataset snapshot if user has the required attribute", () => {
      const attributes = {
        CREATE_DATASETS: true,
      };

      const isForbidden = CLONE_DATASET_SNAPSHOT.isForbidden({ attributes });

      expect(isForbidden).toBe(false);
    });

    it("should forbid cloning dataset snapshot if user does not have the required attribute", () => {
      const attributes = {
        CREATE_DATASETS: false,
      };

      const isForbidden = CLONE_DATASET_SNAPSHOT.isForbidden({ attributes });

      expect(isForbidden).toBe(true);
    });
  });
});
