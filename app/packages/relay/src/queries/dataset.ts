import { graphql } from "relay-runtime";

export default graphql`
  query datasetQuery(
    $savedViewSlug: String
    $name: String!
    $view: BSONArray!
    $extendedView: BSONArray!
  ) {
    config {
      colorBy
      colorPool
      multicolorKeypoints
      showSkeletons
    }

    dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {
      name
      defaultGroupSlice
      viewName
      appConfig {
        colorScheme {
          id
          colorBy
          colorPool
          multicolorKeypoints
          opacity
          showSkeletons
          defaultMaskTargets
          labelTags {
            fieldColor
            valueColors {
              value
              color
            }
          }
          fields {
            colorByAttribute
            fieldColor
            path
            maskTargets
            valueColors {
              color
              value
            }
          }
        }
      }
      ...datasetFragment
    }
    ...savedViewsFragment
    ...configFragment
    ...stageDefinitionsFragment
    ...viewSchemaFragment
  }
`;
