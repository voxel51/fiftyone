import { graphql } from 'react-relay/hooks';

export const currentOrganizationQuery = graphql`
  query OrganizationQuery {
    organization {
      displayName
      pypiToken
    }
  }
`;
