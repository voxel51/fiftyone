import { graphql } from "react-relay";

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
