import { graphql } from "react-relay";

export default graphql`
  query histogramValuesDatetimeQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    histogramValues(datasetName: $dataset, view: $view, path: $path) {
      ... on DatetimeHistogramValuesResponse {
        values {
          count
          min
          max
        }
      }
    }
  }
`;
