import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetAppConfigFragment on DatasetAppConfig {
    colorScheme {
      ...colorSchemeFragment
    }
    disableFrameFiltering
    gridMediaField
    mediaFields
    modalMediaField
    mediaFallback
    plugins
  }
`;
