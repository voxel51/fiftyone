import { graphql } from "react-relay";

import r from "../resolve";

export default r(graphql`
  mutation setFieldVisibilityMutation(
    $subscription: String!
    $session: String
    $input: FieldVisibilityInput!
  ) {
    setFieldVisibility(
      subscription: $subscription
      session: $session
      input: $input
    )
  }
`);
