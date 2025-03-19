import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetAppConfigFragment on DatasetAppConfig {
    activeFields {
      exclude
      paths
    }
    colorScheme {
      ...colorSchemeFragment
    }
    disableFrameFiltering
    dynamicGroupsTargetFrameRate
    gridMediaField
    mediaFields
    modalMediaField
    mediaFallback
    plugins
  }
`;
