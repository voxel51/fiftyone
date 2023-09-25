import { graphql } from "relay-runtime";

export default graphql`
  fragment datasetAppConfigFragment on DatasetAppConfig {
    gridMediaField
    mediaFields
    modalMediaField
    plugins
    sidebarMode
    colorScheme {
      id
      colorPool
      colorBy
      opacity
      useMultiColorKeypoints
      showKeypointSkeleton
      fields {
        colorByAttribute
        fieldColor
        path
        valueColors {
          color
          value
        }
      }
    }
  }
`;
