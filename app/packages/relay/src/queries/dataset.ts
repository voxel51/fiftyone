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
            intTarget
            color
          }
          defaultColorscale {
            name
            list {
              value
              color
            }
            rgb
          }
          colorscales {
            path
            name
            list {
              value
              color
            }
            rgb
          }
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
            maskTargetsColors {
              intTarget
              color
            }
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
