import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSelectionStyleMutation(
    $subscription: String!
    $session: String
    $style: JSON!
  ) {
    setSelectionStyle(
      subscription: $subscription
      session: $session
      style: $style
    )
  }
`);
