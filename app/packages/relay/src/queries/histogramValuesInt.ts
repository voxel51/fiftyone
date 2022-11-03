import { graphql } from "react-relay";

export default graphql`
  query histogramValuesIntQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    histogramValues(datasetName: $dataset, view: $view, path: $path) {
      ... on IntHistogramValuesResponse {
        values {
          count
          min
          max
        }
      }
    }
  }
`;
