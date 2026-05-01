import { graphql } from "react-relay";

import r from "../resolve";

/**
 * Backward-compatible mutation that accepts a flat list of sample IDs.
 * All samples are set to "default" selection type.
 *
 * Prefer setSelectedSamples for new code that needs selection type support.
 */
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
