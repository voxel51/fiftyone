import { graphql } from "react-relay";

export default graphql`
  query histogramValuesIntQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ histogramValues: { path: $path } }]
    ) {
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
