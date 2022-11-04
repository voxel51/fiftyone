import { graphql } from "react-relay";

export default graphql`
  query countValuesIntQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ countValues: { path: $path } }]
    ) {
      ... on IntCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
