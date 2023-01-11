import { graphql } from "react-relay";

export default graphql`
  query countValuesQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
    $form: ExtendedViewForm
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ countValues: { field: $path } }]
      form: $form
    ) {
      __typename
      ... on BoolCountValuesResponse {
        values {
          value
          bool: key
        }
      }
      ... on StrCountValuesResponse {
        values {
          value
          str: key
        }
      }
    }
  }
`;
