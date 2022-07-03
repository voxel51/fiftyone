import { graphql } from "relay-runtime";

export default graphql`
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
`;
