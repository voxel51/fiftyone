import { graphql } from "react-relay";

export default graphql`
  query countValuesStrQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ countValues: { path: $path } }]
    ) {
      ... on StrCountValuesResponse {
        values {
          count
          value
        }
      }
    }
  }
`;
