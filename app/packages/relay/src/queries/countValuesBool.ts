import { graphql } from "react-relay";

export default graphql`
  query countValuesBoolQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ countValues: { path: $path } }]
    ) {
      ... on BoolCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
