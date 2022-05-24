import { graphql } from "relay-runtime";

export default graphql`
  mutation setSelectedLabelsMutation(
    $subscription: String!
    $session: String
    $selectedLabels: [SelectedLabel!]!
  ) {
    setSelectedLabels(
      subscription: $subscription
      session: $session
      selectedLabels: $selectedLabels
    )
  }
`;
