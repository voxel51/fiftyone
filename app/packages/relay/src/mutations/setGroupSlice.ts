import { graphql } from "react-relay";

export default graphql`
  mutation setGroupSliceMutation(
    $subscription: String!
    $session: String
    $view: BSONArray!
    $slice: String!
  ) {
    setGroupSlice(
      subscription: $subscription
      session: $session
      view: $view
      slice: $slice
    ) {
      id
      groupSlice
    }
  }
`;
