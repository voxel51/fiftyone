import { graphql } from "relay-runtime";

export default graphql`
  query datasetQuery(
    $extendedView: BSONArray!
    $name: String!
    $savedViewSlug: String
    $view: BSONArray!
    $workspaceSlug: String
  ) {
    config {
      colorBy
      colorPool
      colorscale
      multicolorKeypoints
      showSkeletons
    }

    dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {
      name
      defaultGroupSlice
      viewName
      savedViewSlug
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

      workspace(slug: $workspaceSlug) {
        id
        child
        slug
      }

      ...datasetFragment
    }
    ...savedViewsFragment
    ...configFragment
    ...stageDefinitionsFragment
    ...viewSchemaFragment
  }
`;
