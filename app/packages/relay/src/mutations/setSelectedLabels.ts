import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
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
`);
