import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setSelectedSamplesMutation(
    $subscription: String!
    $session: String
    $selectedSamples: JSON!
  ) {
    setSelectedSamples(
      subscription: $subscription
      session: $session
      selectedSamples: $selectedSamples
    )
  }
`);
