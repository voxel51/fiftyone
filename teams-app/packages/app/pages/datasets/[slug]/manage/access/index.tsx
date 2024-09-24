import {
  useCurrentDatasetPermission,
  useCurrentOrganization,
  useCurrentUserPermission,
  withPermissions,
} from "@fiftyone/hooks";
import { Box, SectionHeader, TableSkeleton } from "@fiftyone/teams-components";
import {
  INVITE_PEOPLE_TO_DATASET,
  MANAGE_DATASET_ACCESS,
  MANAGE_ORGANIZATION,
  SET_DATASET_DEFAULT_PERMISSION,
} from "@fiftyone/teams-state";
import { LEARN_MORE_ABOUT_ROLES_LINK } from "@fiftyone/teams-state/src/constants";
import { Link, Typography } from "@mui/material";
import NextLink from "next/link";
import Layout from "../components/Layout";
import GrantUserDatasetAccess from "./components/GrantUserDatasetAccess";
import ManageDefaultDatasetAccess from "./components/ManageDefaultDatasetAccess";
import ManagePeopleDatasetAccess from "./components/ManagePeopleDatasetAccess";
import GrantGroupDatasetAccess from "./components/GrantGroupDatasetAccess";
import { Suspense } from "react";
import InviteControls from "./components/InviteControls";

function Access() {
  const canSetDefaultPermission = useCurrentDatasetPermission([
    SET_DATASET_DEFAULT_PERMISSION,
  ]);
  const canInvite = useCurrentDatasetPermission([INVITE_PEOPLE_TO_DATASET]);
  const canManageOrganization = useCurrentUserPermission([MANAGE_ORGANIZATION]);
  const { displayName } = useCurrentOrganization();

  return (
    <Layout>
      <Box data-testid="manage-access">
        <SectionHeader
          title="Default access"
          content={
            <Typography variant="body1">
              {`Manage access for members at ${displayName}. All admins will
                also have access; collaborators and guests will only have access if they're
                specifically invited to a dataset.`}
              <br />
              <Link href={LEARN_MORE_ABOUT_ROLES_LINK + "#default-access"}>
                Learn more about default access.
              </Link>
            </Typography>
          }
        />
        <Box paddingTop={2} paddingBottom={4}>
          <Suspense fallback={<TableSkeleton rows={1} />}>
            <ManageDefaultDatasetAccess readOnly={!canSetDefaultPermission} />
          </Suspense>
        </Box>
        <SectionHeader
          title="Specific access"
          content={
            <Typography variant="body1">
              These people and groups have specific access to this dataset.
              <br />
              <Link
                href={LEARN_MORE_ABOUT_ROLES_LINK + "#teams-specifc-access"}
              >
                Learn more about specific access.
              </Link>
              <br />
              {canManageOrganization ? (
                <>
                  <NextLink href="/settings/team/users" passHref>
                    <Link>Manage team settings</Link>
                  </NextLink>
                </>
              ) : (
                ""
              )}
              .
            </Typography>
          }
        >
          {canInvite && <InviteControls />}
        </SectionHeader>
        <GrantUserDatasetAccess />
        <GrantGroupDatasetAccess />
        <Box paddingTop={2} paddingBottom={4}>
          <Suspense fallback={<TableSkeleton rows={12} />}>
            <ManagePeopleDatasetAccess />
          </Suspense>
        </Box>
      </Box>
    </Layout>
  );
}

export default withPermissions(Access, [MANAGE_DATASET_ACCESS], "dataset", {
  getLayoutProps: () => ({ topNavProps: { noBorder: true } }),
});

export { getServerSideProps } from "lib/env";
