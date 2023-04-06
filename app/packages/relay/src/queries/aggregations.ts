import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query aggregationsQuery($form: AggregationForm!) {
    aggregations(form: $form) {
      __typename
      ... on Aggregation {
        path
        count
        exists
      }
      ... on BooleanAggregation {
        false
        true
      }
      ... on IntAggregation {
        max
        min
      }
      ... on FloatAggregation {
        inf
        max
        min
        nan
        ninf
      }
      ... on RootAggregation {
        slice
        expandedFieldCount
        frameLabelFieldCount
      }
      ... on StringAggregation {
        values {
          count
          value
        }
      }
    }
  }
`);
