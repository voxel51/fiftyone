import { useCacheStore, useCurrentOrganization } from "@fiftyone/hooks";
import {
  DATASET_SHARE_MODAL_INFO_CACHE_KEY,
  DatasetPermission,
  manageDatasetDefaultAccessInfoQuery,
  manageDatasetDefaultAccessInfoQueryT,
  manageDatasetSetDatasetDefaultPermissionMutation,
} from "@fiftyone/teams-state";
import {
  DatasetPermissionSelection,
  TableContainer,
} from "@fiftyone/teams-components";
import { CorporateFare } from "@mui/icons-material";
import {
  Avatar,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@mui/material";
import { useRouter } from "next/router";
import { useLazyLoadQuery } from "react-relay";
import { useMutation } from "@fiftyone/hooks";
import { useState } from "react";

type ManageDefaultDatasetAccessProps = {
  readOnly?: boolean;
};

export default function ManageDefaultDatasetAccess({
  readOnly,
}: ManageDefaultDatasetAccessProps) {
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const result = useLazyLoadQuery<manageDatasetDefaultAccessInfoQueryT>(
    manageDatasetDefaultAccessInfoQuery,
    { identifier: datasetIdentifier as string },
    { fetchPolicy: "store-and-network" }
  );

  const usersCount = result?.dataset?.usersCount || "";

  const [defaultPermission, setDefaultPermission] = useState<DatasetPermission>(
    (result?.dataset?.defaultPermission || "VIEW") as DatasetPermission
  );

  const [setDatasetDefaultPermission] = useMutation(
    manageDatasetSetDatasetDefaultPermissionMutation
  );
  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;
  const [_, setStale] = useCacheStore(DATASET_SHARE_MODAL_INFO_CACHE_KEY);

  return (
    <TableContainer>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell width="50%">
              <CardHeader
                sx={{ padding: 0 }}
                avatar={
                  <Avatar>
                    <CorporateFare />
                  </Avatar>
                }
                title={`Members at ${organizationDisplayName}`}
                subheader={`${usersCount} people`}
                titleTypographyProps={{
                  variant: "body1",
                  color: (theme) => theme.palette.text.primary,
                }}
                subheaderTypographyProps={{
                  variant: "body1",
                }}
              />
            </TableCell>
            <TableCell width="50%" align="right">
              <DatasetPermissionSelection
                defaultValue={defaultPermission}
                value={defaultPermission}
                onChange={(permission) => {
                  setDatasetDefaultPermission({
                    successMessage:
                      "Successfully updated the default permission of dataset",
                    errorMessage:
                      "Failed to update the default permission of dataset",
                    variables: { datasetIdentifier, permission },
                    onCompleted() {
                      setDefaultPermission(permission);
                      setStale(true);
                    },
                  });
                }}
                includeNoAccess
                disabled={readOnly}
                selectProps={{ sx: { textAlign: "left" } }}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
