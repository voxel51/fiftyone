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
      colorBy
      colorPool
      multicolorKeypoints
      opacity
      showSkeletons
      labelTags {
        fieldColor
        valueColors {
          color
          value
        }
      }
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
