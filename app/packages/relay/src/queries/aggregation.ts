import { graphql } from "react-relay";

export default graphql`
  query aggregationQuery($form: AggregationForm!) {
    aggregation(form: $form) {
      ... on Aggregation {
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
      }
      ... on StringAggregation {
        values {
          count
          value
        }
      }
    }
  }
`;
