import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query aggregationsQuery($form: AggregationForm!) {
    aggregations(form: $form) {
      __typename
      ... on BooleanAggregation {
        path
        count
        exists
        false
        true
      }
      ... on IntAggregation {
        path
        count
        exists
        max
        min
      }
      ... on FloatAggregation {
        path
        count
        exists
        inf
        max
        min
        nan
        ninf
      }
      ... on RootAggregation {
        path
        count
        exists
        slice
        expandedFieldCount
        frameLabelFieldCount
      }
      ... on StringAggregation {
        path
        count
        exists
        values {
          count
          value
        }
      }
    }
  }
`);
