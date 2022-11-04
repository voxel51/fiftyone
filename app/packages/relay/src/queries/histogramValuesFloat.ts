import { graphql } from "react-relay";

export default graphql`
  query histogramValuesFloatQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ histogramValues: { path: $path } }]
    ) {
      ... on FloatHistogramValuesResponse {
        values {
          count
          min
          max
        }
      }
    }
  }
`;
