import { graphql } from "react-relay";
import r from "../resolve";

export default r(graphql`
  query samplePositionQuery(
    $input: OrderInput!
    $sampleId: String = null
    $groupId: String = null
  ) {
    samplePosition(input: $input, sampleId: $sampleId, groupId: $groupId) {
      offset {
        __typename
        ... on SamplePositionValue {
          value
        }
      }
      total {
        __typename
        ... on SamplePositionValue {
          value
        }
      }
    }
  }
`);
