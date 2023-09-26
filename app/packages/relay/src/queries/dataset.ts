import { graphql } from "relay-runtime";

export default graphql`
  query datasetQuery(
    $savedViewSlug: String
    $name: String!
    $view: BSONArray!
    $extendedView: BSONArray!
  ) {
    config {
      colorPool
    }

    dataset(name: $name, view: $extendedView, savedViewSlug: $savedViewSlug) {
      name
      defaultGroupSlice
      appConfig {
        colorScheme {
          id
          colorPool
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
      ...datasetFragment
    }
    ...savedViewsFragment
    ...configFragment
    ...stageDefinitionsFragment
    ...viewSchemaFragment
  }
`;
