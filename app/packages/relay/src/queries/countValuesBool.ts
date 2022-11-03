import { graphql } from "react-relay";

export default graphql`
  query countValuesBoolQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    countValues(datasetName: $dataset, view: $view, path: $path) {
      ... on BoolCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
