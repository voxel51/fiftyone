import { graphql } from "relay-runtime";

export default graphql`
  fragment sidebarGroupsFragment on Dataset @inline {
    appConfig {
      sidebarGroups {
        expanded
        paths
        name
      }
    }
    ...frameFieldsFragment
    ...sampleFieldsFragment
  }
`;
