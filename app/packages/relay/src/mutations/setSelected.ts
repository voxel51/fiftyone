import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSelectedMutation(
    $subscription: String!
    $session: String
    $selected: [String!]!
  ) {
    setSelected(
      subscription: $subscription
      session: $session
      selected: $selected
    )
  }
`);
