import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setVisiblePathsMutation(
    $subscription: String!
    $session: String
    $visiblePaths: [String!]
  ) {
    setVisiblePaths(
      subscription: $subscription
      session: $session
      visiblePaths: $visiblePaths
    )
  }
`);
