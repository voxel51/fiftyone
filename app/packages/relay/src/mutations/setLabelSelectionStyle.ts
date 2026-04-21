import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setLabelSelectionStyleMutation(
    $subscription: String!
    $session: String
    $style: JSON!
  ) {
    setLabelSelectionStyle(
      subscription: $subscription
      session: $session
      style: $style
    )
  }
`);
