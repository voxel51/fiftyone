import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query histogramValuesQuery(
    $dataset: String!
    $view: BSONArray!
    $path: String!
    $form: ExtendedViewForm
  ) {
    aggregate(
      datasetName: $dataset
      view: $view
      aggregations: [{ histogramValues: { field: $path } }]
      form: $form
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
`);
