import { graphql } from "react-relay";

export default graphql`
  query histogramValuesQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ histogramValues: { field: $path } }]
    ) {
      __typename
      ... on DatetimeHistogramValuesResponse {
        counts
        other
        datetimes: edges
      }
      ... on FloatHistogramValuesResponse {
        counts
        other
        floats: edges
      }
      ... on IntHistogramValuesResponse {
        counts
        other
        ints: edges
      }
    }
  }
`;
