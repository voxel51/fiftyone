import { graphql } from "react-relay";

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
