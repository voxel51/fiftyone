import { graphql } from "react-relay";

export default graphql`
  query countValuesStrQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    countValues(datasetName: $dataset, view: $view, path: $path) {
      ... on StrCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
