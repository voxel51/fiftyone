import { graphql } from "relay-runtime";

export default graphql`
  fragment sidebarGroupsFragment on Dataset {
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
