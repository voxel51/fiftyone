import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  query aggregationsQuery($form: AggregationForm!) {
    aggregations(form: $form) {
      __typename
      ... on EventAggregation {
        path
        count
        exists
        total
        events {
          projection
          id
          name
          label
          count
        }
      }
      ... on AggregationQueryTimeout {
        path
        queryTime
      }
      ... on BooleanAggregation {
        path
        count
        exists
        false
        true
      }
      ... on DataAggregation {
        path
        count
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
