import { graphql } from "relay-runtime";

export default graphql`
  fragment sidebarGroupsFragment on Dataset {
    datasetId
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
