import { graphql } from "react-relay/hooks";
import { Group } from "../Settings";

export const currentUserQuery = graphql`
  query UserQuery {
    viewer {
      apiKeys {
        createdAt
        id
        name
      }
      picture
      role
      name
      id
      email
      attributes {
        ...UserAttrFrag
      }
      # userGroups { # NOTE: uncommenting this may cause Auth0 rate limit
      #   id
      #   slug
      #   name
      #   description
      # }
    }
  }
`;

// define the fragments
export const userAttrFragment = graphql`
  fragment UserAttrFrag on UserAttributeInfo {
    ... on BoolUserAttributeInfo {
      attribute
      display
      description
      __typename
      boolValue: value
      boolOptions: options
    }
    ... on DatasetAccessLevelUserAttributeInfo {
      attribute
      display
      description
      __typename
      accessLevelValue: value
      accessLevelOptions: options
    }
    ... on DatasetPermissionUserAttributeInfo {
      attribute
      display
      description
      __typename
      permissionValue: value
      permissionOptions: options
    }
  }
`;

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  role: string;
  userGroups: Group[];
}
