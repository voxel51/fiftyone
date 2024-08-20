import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSampleMutation(
    $subscription: String!
    $session: String
    $groupId: String
    $id: String
  ) {
    setSample(
      subscription: $subscription
      session: $session
      groupId: $groupId
      id: $id
    )
  }
`);
