import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSampleSelectionStyleMutation(
    $subscription: String!
    $session: String
    $style: JSON!
  ) {
    setSampleSelectionStyle(
      subscription: $subscription
      session: $session
      style: $style
    )
  }
`);
