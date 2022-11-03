import { graphql } from "react-relay";

export default graphql`
  query countValuesIntQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    countValues(datasetName: $dataset, view: $view, path: $path) {
      ... on IntCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
