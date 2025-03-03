import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetAppConfigFragment on DatasetAppConfig {
    colorScheme {
      ...colorSchemeFragment
    }
    defaultVisibilityLabels {
      include
      exclude
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
