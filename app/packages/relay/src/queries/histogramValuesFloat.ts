import { graphql } from "react-relay";

export default graphql`
  query histogramValuesFloatQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    histogramValues(datasetName: $dataset, view: $view, path: $path) {
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
