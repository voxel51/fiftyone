import { graphql } from "react-relay";

export default graphql`
  query histogramValuesDatetimeQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ histogramValues: { path: $path } }]
    ) {
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
