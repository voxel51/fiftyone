import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setGroupSliceMutation(
    $subscription: String!
    $session: String
    $slice: String!
  ) {
    setGroupSlice(subscription: $subscription, session: $session, slice: $slice)
  }
`);
