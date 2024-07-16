import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSampleMutation(
    $subscription: String!
    $session: String
    $groupId: String
    $sampleId: String
  ) {
    setSample(
      subscription: $subscription
      session: $session
      groupId: $groupId
      sampleId: $sampleId
    )
  }
`);
