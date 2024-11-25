import { currentOrganizationQuery } from "@fiftyone/teams-state";
import { OrganizationQuery } from "@fiftyone/teams-state/src/Organization/__generated__/OrganizationQuery.graphql";
import { useMemo } from "react";
import { loadQuery, usePreloadedQuery, useRelayEnvironment } from "react-relay";

export default function useCurrentOrganization() {
  const environment = useRelayEnvironment();
  const query = useMemo(
    () =>
      loadQuery<OrganizationQuery>(environment, currentOrganizationQuery, {}),
    [environment]
  );
  // todo: use SSR
  const currentOrganization = usePreloadedQuery<OrganizationQuery>(
    currentOrganizationQuery,
    query
  );

  return currentOrganization?.organization;
}
