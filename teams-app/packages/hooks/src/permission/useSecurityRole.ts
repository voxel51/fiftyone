import {
  DatasetPermission,
  Role,
  securityDisplayRolesQuery,
  securityGetEverythingQueryT,
  securityRoleAttrFragment,
  UserAttributeT,
} from "@fiftyone/teams-state";
import { UserAttribute } from "@fiftyone/teams-state/src/Settings/__generated__/securityAttrFrag.graphql";
import { useFragment } from "react-relay";
import { convertRoleAttributes, RoleAttribute } from "./utils";
import { useCallback, useState } from "react";
import { useLazyLoadLatestQuery } from "../common";

// Define the order of roles
export const roleOrder: Role[] = ["ADMIN", "MEMBER", "COLLABORATOR", "GUEST"];

type RawAttributesRolePermission = RowPermission[][];

export type RoleAttributesResults = {
  [k in Role]: {
    [j in UserAttributeT]: boolean | DatasetPermission | string;
  };
};

type RowPermission = {
  attribute: UserAttribute;
  __typename: string;
  boolValue?: boolean;
  permissionValue?: DatasetPermission;
  accessLevelValue?: string;
};

type UseSecurityRoleResult = {
  byUserAction: RawAttributesRolePermission | null;
  byRole: RoleAttributesResults | null;
  maxDatasetPermission: (role: Role) => DatasetPermission;
};

const useSecurityRoleData = () => {
  const [fetchKey, setFetchKey] = useState(0);
  const data = useLazyLoadLatestQuery<securityGetEverythingQueryT>(
    securityDisplayRolesQuery,
    {},
    { fetchPolicy: "store-and-network", fetchKey }
  );

  const refetch = useCallback(() => {
    setFetchKey(fetchKey + 1);
  }, []);

  return [data?.roles || [], refetch];
};

const useSecurityRole = (): UseSecurityRoleResult => {
  const [data, _] = useSecurityRoleData();
  const attributesByRole = convertRoleAttributes(
    data as unknown as RoleAttribute[],
    roleOrder
  );

  const finalData: RawAttributesRolePermission = attributesByRole.map(
    (attributeFragList) => {
      return attributeFragList.map((attribute) => {
        return useFragment<any>(securityRoleAttrFragment, attribute);
      });
    }
  );

  const dataByRole = convertData(finalData, roleOrder);

  const maxDatasetPermission = useCallback(
    (role: Role) => {
      if (!dataByRole) return "EDIT";
      return dataByRole[role]["MAX_DATASET_PERMISSION"] as DatasetPermission;
    },
    [dataByRole]
  );

  return {
    byUserAction: finalData,
    byRole: dataByRole,
    maxDatasetPermission,
  };
};

export default useSecurityRole;

const convertData: (
  data: RawAttributesRolePermission,
  roleOrder: Role[]
) => RoleAttributesResults = (data, roleOrder) => {
  const dict = {
    ADMIN: {},
    MEMBER: {},
    COLLABORATOR: {},
    GUEST: {},
  } as RoleAttributesResults;

  data.forEach((attributeDataList) => {
    attributeDataList.forEach((attributeRoleData, idx) => {
      const role = roleOrder[idx];
      dict[role][attributeRoleData.attribute] =
        attributeRoleData?.permissionValue ||
        attributeRoleData?.accessLevelValue ||
        attributeRoleData?.boolValue;
    });
  });

  return dict;
};
