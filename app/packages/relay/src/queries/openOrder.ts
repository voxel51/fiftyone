import { graphql } from "react-relay";
import r from "../resolve";

export default r(graphql`
  query openOrderQuery($input: OrderInput!) {
    openOrder(input: $input) {
      __typename
      ... on Order {
        token
        mode
        total
        bounds {
          min
          max
          scale
        }
        ticks {
          fraction
          label
        }
      }
      ... on OrderUnavailable {
        reason
      }
    }
  }
`);
