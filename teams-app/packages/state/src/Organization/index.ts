import { graphql } from "react-relay/hooks";

export const currentOrganizationQuery = graphql`
  query OrganizationQuery {
    organization {
      displayName
      pypiToken
      roleReupgradeGracePeriod
      roleReupgradePeriod
    }
  }
`;

export const OrganizationFeatureFlagsQuery = graphql`
  query OrganizationFeatureFlagQuery {
    featureFlag {
      invitationsEnabled
      invitationEmailsEnabled
    }
  }
`;
