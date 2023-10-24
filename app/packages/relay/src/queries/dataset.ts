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
          defaultMaskTargetsColors {
            idx
            color
          }
          labelTags {
            fieldColor
            valueColors {
              value
              color
            }
          }
          colorscale {
            name
            list
          }
          fields {
            colorByAttribute
            fieldColor
            path
            maskTargetsColors {
              idx
              color
            }
            valueColors {
              color
              value
            }
            colorscale {
              name
              list
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
